import { expect, test, vi } from 'vitest';
import { z } from 'zod';

import { createScriptSchema } from '../../../src/runtime/create-script-schema.js';
import { defineScript } from '../../../src/runtime/define-script.js';
import { executeScript } from '../../../src/runtime/execute-script.js';
import { createScriptRegistry } from '../../../src/runtime/registry.js';
import { ScriptFault } from '../../../src/spec/script-errors.js';
import type { EventSink, ScriptEvent } from '../../../src/spec/script-events.js';
import type { ScriptSchema } from '../../../src/spec/script-schema.js';

const inputSchema = createScriptSchema({
  id: 'revo.script.test.echo.input/v1',
  schema: z.strictObject({ message: z.string() }),
  jsonSchema: 'input',
});

const resultSchema = createScriptSchema({
  id: 'revo.script.test.echo.result/v1',
  schema: z.strictObject({ echoed: z.string() }),
  jsonSchema: 'output',
});

const definition = defineScript({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:test/echo',
    version: '1.0.0',
    summary: 'Returns the provided message.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'pure',
    permissions: [],
    resources: [],
    effects: [],
    timeout: { wallClockMs: 1_000 },
    retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
    idempotency: 'read-only',
    redaction: {
      inputPaths: [],
      resultPaths: [],
      errorPaths: [],
      eventPaths: [],
    },
    events: { allowed: [], detailPaths: [] },
  },
  inputSchema,
  resultSchema,
  implementation: { id: '@revisium/revo-scripts/test/echo', version: '1.0.0' },
  handler: async (input) => ({ value: { echoed: input.message } }),
});

const createRecordingSink = () => {
  const events: ScriptEvent[] = [];
  const sink: EventSink = {
    emit: async (event) => {
      events.push(structuredClone(event));
    },
  };

  return { events, sink };
};

const fixedClock = {
  now: () => 1_000,
  sleep: async () => {},
};

test('executes one registered script and returns its typed result', async () => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-1',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: true,
    value: { echoed: 'hello' },
    evidence: [],
    attempts: 1,
  });
  expect(events).toEqual([
    {
      name: 'revo.script.started',
      details: {
        executionId: 'execution-1',
        scriptId: 'script:test/echo',
        scriptVersion: '1.0.0',
        definitionDigest: definition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
      },
    },
    {
      name: 'revo.script.succeeded',
      details: {
        executionId: 'execution-1',
        scriptId: 'script:test/echo',
        scriptVersion: '1.0.0',
        definitionDigest: definition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
        durationMs: 0,
      },
    },
  ]);
});

test('returns one structured preflight failure without a started event', async () => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-2',
    input: { message: 42 },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  const failure = {
    code: 'revo.script.validation.input',
    message: 'Script input is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          message: 'Invalid input: expected string, received number',
          path: ['message'],
        },
      ],
    },
  } as const;

  expect(result).toEqual({ ok: false, error: failure, attempts: 0 });
  expect(events).toEqual([
    {
      name: 'revo.script.failed',
      details: {
        executionId: 'execution-2',
        scriptId: 'script:test/echo',
        scriptVersion: '1.0.0',
        definitionDigest: definition.definitionDigest,
        attempt: 0,
        timestampMs: 1_000,
        durationMs: 0,
        error: failure,
      },
    },
  ]);
});

test('redacts custom events and typed failure details before they leave the runtime', async () => {
  const failingDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/failure',
      summary: 'Emits one event and reports a provider failure.',
      redaction: {
        ...definition.manifest.redaction,
        errorPaths: ['/secret'],
        eventPaths: ['/secret'],
      },
      events: {
        allowed: ['test.provider.observed'],
        detailPaths: ['/secret', '/visible'],
      },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/failure', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({
        name: 'test.provider.observed',
        details: { secret: input.message, visible: 'kept' },
      });
      throw new ScriptFault('revo.script.provider.transient', 'Provider request failed.', {
        retryable: true,
        details: { secret: input.message, status: 503 },
      });
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(failingDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-3',
    input: { message: 'sensitive-value' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  const failure = {
    code: 'revo.script.provider.transient',
    message: 'Provider request failed.',
    retryable: false,
    details: { secret: '[REDACTED]', status: 503 },
  } as const;

  expect(result).toEqual({ ok: false, error: failure, attempts: 1 });
  expect(events).toEqual([
    {
      name: 'revo.script.started',
      details: {
        executionId: 'execution-3',
        scriptId: 'script:test/failure',
        scriptVersion: '1.0.0',
        definitionDigest: failingDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
      },
    },
    {
      name: 'test.provider.observed',
      details: { secret: '[REDACTED]', visible: 'kept' },
    },
    {
      name: 'revo.script.failed',
      details: {
        executionId: 'execution-3',
        scriptId: 'script:test/failure',
        scriptVersion: '1.0.0',
        definitionDigest: failingDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
        durationMs: 0,
        error: failure,
      },
    },
  ]);
});

test('retries only an explicitly transient typed failure within the manifest policy', async () => {
  let invocationCount = 0;
  const retryDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/retry',
      summary: 'Retries one transient test failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/retry', version: '1.0.0' },
    handler: async (input, context) => {
      invocationCount += 1;

      if (context.attempt === 1) {
        throw new ScriptFault('revo.script.provider.transient', 'Provider is temporarily busy.', {
          retryable: true,
        });
      }

      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(retryDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();
  const sleeps: number[] = [];
  let now = 1_000;
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };

  const result = await executeScript(registry, script, {
    executionId: 'execution-4',
    input: { message: 'eventual-success' },
    resources: {},
    eventSink: sink,
    clock,
  });

  expect({ result, invocationCount, sleeps }).toEqual({
    result: {
      ok: true,
      value: { echoed: 'eventual-success' },
      evidence: [],
      attempts: 2,
    },
    invocationCount: 2,
    sleeps: [10],
  });
  expect(events).toEqual([
    {
      name: 'revo.script.started',
      details: {
        executionId: 'execution-4',
        scriptId: 'script:test/retry',
        scriptVersion: '1.0.0',
        definitionDigest: retryDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
      },
    },
    {
      name: 'revo.script.retrying',
      details: {
        executionId: 'execution-4',
        scriptId: 'script:test/retry',
        scriptVersion: '1.0.0',
        definitionDigest: retryDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
        nextAttempt: 2,
        backoffMs: 10,
        error: {
          code: 'revo.script.provider.transient',
          message: 'Provider is temporarily busy.',
          retryable: true,
        },
      },
    },
    {
      name: 'revo.script.succeeded',
      details: {
        executionId: 'execution-4',
        scriptId: 'script:test/retry',
        scriptVersion: '1.0.0',
        definitionDigest: retryDefinition.definitionDigest,
        attempt: 2,
        timestampMs: 1_010,
        durationMs: 10,
      },
    },
  ]);
});

test('rejects a missing prepared resource before invoking the handler', async () => {
  let invoked = false;
  const resourceDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/resource',
      summary: 'Reads one prepared repository resource.',
      effectClass: 'read',
      permissions: ['git.status.read'],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      effects: ['git.read'],
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/resource', version: '1.0.0' },
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(resourceDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-5',
    input: { message: 'not-run' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, invoked, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.permission.resource',
        message: 'Prepared resource repository is missing.',
        retryable: false,
        details: { resource: 'repository' },
      },
      attempts: 0,
    },
    invoked: false,
    eventNames: ['revo.script.failed'],
  });
});

test('requires an idempotency key before invoking a mutation script', async () => {
  let invoked = false;
  const mutationDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/mutation',
      summary: 'Performs one idempotent test mutation.',
      effectClass: 'write',
      permissions: ['git.test.write'],
      resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
      effects: ['git.write'],
      idempotency: 'required',
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/mutation', version: '1.0.0' },
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(mutationDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-6',
    input: { message: 'not-run' },
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: { permissions: ['git.test.write'], effects: ['git.write'] },
        capabilities: {},
      },
    },
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, invoked, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.key_required',
        message: 'This script requires an idempotency key.',
        retryable: false,
      },
      attempts: 0,
    },
    invoked: false,
    eventNames: ['revo.script.failed'],
  });
});

test('aborts an active handler at the total wall-clock deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);

  try {
    const timeoutDefinition = defineScript({
      manifest: {
        ...definition.manifest,
        id: 'script:test/timeout',
        summary: 'Waits until the runtime deadline aborts the handler.',
        timeout: { wallClockMs: 50 },
      },
      inputSchema,
      resultSchema,
      implementation: { id: '@revisium/revo-scripts/test/timeout', version: '1.0.0' },
      handler: async (_input, context) =>
        new Promise((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), {
            once: true,
          });
        }),
    });
    const registry = createScriptRegistry();
    const script = registry.register(timeoutDefinition);
    registry.seal();
    const { events, sink } = createRecordingSink();

    const execution = executeScript(registry, script, {
      executionId: 'execution-7',
      input: { message: 'wait' },
      resources: {},
      eventSink: sink,
    });
    await vi.advanceTimersByTimeAsync(50);
    const result = await execution;

    const failure = {
      code: 'revo.script.timeout.deadline',
      message: 'Script wall-clock deadline expired.',
      retryable: false,
    } as const;

    expect(result).toEqual({ ok: false, error: failure, attempts: 1 });
    expect(events).toEqual([
      {
        name: 'revo.script.started',
        details: {
          executionId: 'execution-7',
          scriptId: 'script:test/timeout',
          scriptVersion: '1.0.0',
          definitionDigest: timeoutDefinition.definitionDigest,
          attempt: 1,
          timestampMs: 1_000,
        },
      },
      {
        name: 'revo.script.failed',
        details: {
          executionId: 'execution-7',
          scriptId: 'script:test/timeout',
          scriptVersion: '1.0.0',
          definitionDigest: timeoutDefinition.definitionDigest,
          attempt: 1,
          timestampMs: 1_050,
          durationMs: 50,
          error: failure,
        },
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('rejects an input payload larger than one mebibyte before invoking the handler', async () => {
  let invoked = false;
  const boundedDefinition = defineScript({
    ...definition,
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(boundedDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-8',
    input: { message: 'x'.repeat(1_048_577) },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, invoked, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.payload_limit',
        message: 'Script input exceeds the 1048576-byte JSON payload limit.',
        retryable: false,
        details: { kind: 'input', limitBytes: 1_048_576, actualBytes: 1_048_591 },
      },
      attempts: 0,
    },
    invoked: false,
    eventNames: ['revo.script.failed'],
  });
});

test('returns an event-sink failure without invoking the handler or re-emitting', async () => {
  let invoked = false;
  let sinkCalls = 0;
  const sinkFailureDefinition = defineScript({
    ...definition,
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(sinkFailureDefinition);
  registry.seal();
  const sink: EventSink = {
    emit: async () => {
      sinkCalls += 1;
      throw new Error('sink unavailable');
    },
  };

  const result = await executeScript(registry, script, {
    executionId: 'execution-9',
    input: { message: 'not-run' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, invoked, sinkCalls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.event_sink',
        message: 'Event sink rejected a script event.',
        retryable: false,
      },
      attempts: 0,
    },
    invoked: false,
    sinkCalls: 1,
  });
});

test('converts an unexpected input-validator rejection into a preflight failure', async () => {
  const rejectingInputSchema: ScriptSchema<{ message: string }> = {
    ...inputSchema,
    validate: async () => {
      throw new Error('validator internals');
    },
  };
  const validatorDefinition = defineScript({
    ...definition,
    inputSchema: rejectingInputSchema,
    implementation: { id: '@revisium/revo-scripts/test/validator', version: '1.0.0' },
  });
  const registry = createScriptRegistry();
  const script = registry.register(validatorDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-validator-rejection',
    input: { message: 'not-leaked' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.unexpected',
        message: 'Script input validation failed unexpectedly.',
        retryable: false,
      },
      attempts: 0,
    },
    eventNames: ['revo.script.failed'],
  });
});

test('rejects an invalid handler result through the declared result schema', async () => {
  const rejectingResultSchema: ScriptSchema<{ echoed: string }> = {
    ...resultSchema,
    validate: async () => ({
      ok: false,
      issues: [{ message: 'Expected one echoed string.', path: ['echoed'] }],
    }),
  };
  const invalidResultDefinition = defineScript({
    ...definition,
    resultSchema: rejectingResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/result', version: '1.0.0' },
  });
  const registry = createScriptRegistry();
  const script = registry.register(invalidResultDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-invalid-result',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.result',
      message: 'Script result is invalid.',
      retryable: false,
      details: {
        issues: [{ message: 'Expected one echoed string.', path: ['echoed'] }],
      },
    },
    attempts: 1,
  });
});

test('fails an oversized custom event before it reaches the event sink', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/event-limit',
      summary: 'Emits one bounded test event.',
      events: { allowed: ['test.large'], detailPaths: ['/payload'] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/event-limit', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.large', details: { payload: 'x'.repeat(65_536) } });
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(eventDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-event-limit',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.payload_limit',
        message: 'Script event exceeds the 65536-byte JSON payload limit.',
        retryable: false,
        details: { kind: 'event', limitBytes: 65_536, actualBytes: 65_582 },
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});

test('rejects evidence that exceeds its bounded item count', async () => {
  const evidenceDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/evidence-limit', version: '1.0.0' },
    handler: async (input) => ({
      value: { echoed: input.message },
      evidence: Array.from({ length: 65 }, (_, index) => ({
        kind: 'artifact' as const,
        ref: `artifact-${index}`,
      })),
    }),
  });
  const registry = createScriptRegistry();
  const script = registry.register(evidenceDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-evidence-limit',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence exceeds the 64-item limit.',
      retryable: false,
      details: { kind: 'evidence', limit: 64, actual: 65 },
    },
    attempts: 1,
  });
});

test('does not start retry backoff that cannot fit inside the total deadline', async () => {
  const retryDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/retry-deadline',
      summary: 'Stops retries at the total deadline.',
      timeout: { wallClockMs: 5 },
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/retry-deadline', version: '1.0.0' },
    handler: async () => {
      throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
        retryable: true,
      });
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(retryDefinition);
  registry.seal();
  const { sink } = createRecordingSink();
  const sleeps: number[] = [];
  const clock = {
    now: () => 1_000,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };

  const result = await executeScript(registry, script, {
    executionId: 'execution-retry-deadline',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock,
  });

  expect({ result, sleeps }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.timeout.deadline',
        message: 'Script wall-clock deadline expired before the next retry.',
        retryable: false,
      },
      attempts: 1,
    },
    sleeps: [],
  });
});

test('returns a structured preflight failure for a foreign registry handle', async () => {
  const owningRegistry = createScriptRegistry();
  const foreignScript = owningRegistry.register(definition);
  owningRegistry.seal();
  const executingRegistry = createScriptRegistry();
  executingRegistry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(executingRegistry, foreignScript, {
    executionId: 'execution-foreign-handle',
    input: { message: 'not-run' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  const failure = {
    code: 'revo.script.execution.definition_missing',
    message: 'Registered script handle does not belong to this registry.',
    retryable: false,
  } as const;

  expect({ result, events }).toEqual({
    result: { ok: false, error: failure, attempts: 0 },
    events: [
      {
        name: 'revo.script.failed',
        details: {
          executionId: 'execution-foreign-handle',
          scriptId: 'script:test/echo',
          scriptVersion: '1.0.0',
          definitionDigest: definition.definitionDigest,
          attempt: 0,
          timestampMs: 1_000,
          durationMs: 0,
          error: failure,
        },
      },
    ],
  });
});

test('does not expose an unknown handler error through the package boundary', async () => {
  const unknownFailureDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/unknown-failure', version: '1.0.0' },
    handler: async () => {
      throw new Error('secret provider diagnostics');
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(unknownFailureDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-unknown-failure',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.execution.unexpected',
      message: 'Script execution failed unexpectedly.',
      retryable: false,
    },
    attempts: 1,
  });
});

test('rejects an undeclared custom event before it reaches the sink', async () => {
  const eventDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/undeclared-event', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.undeclared' });
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(eventDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-undeclared-event',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.permission.event',
        message: 'Custom event test.undeclared is not declared by the script manifest.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});

test('rejects a result payload larger than one mebibyte', async () => {
  const largeResultDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/result-limit', version: '1.0.0' },
    handler: async () => ({ value: { echoed: 'x'.repeat(1_048_577) } }),
  });
  const registry = createScriptRegistry();
  const script = registry.register(largeResultDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-result-limit',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script result exceeds the 1048576-byte JSON payload limit.',
      retryable: false,
      details: { kind: 'result', limitBytes: 1_048_576, actualBytes: 1_048_590 },
    },
    attempts: 1,
  });
});

test('rejects an evidence reference longer than its Unicode code-point limit', async () => {
  const evidenceDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/evidence-ref', version: '1.0.0' },
    handler: async (input) => ({
      value: { echoed: input.message },
      evidence: [{ kind: 'artifact', ref: 'x'.repeat(2_049) }],
    }),
  });
  const registry = createScriptRegistry();
  const script = registry.register(evidenceDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-evidence-ref',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence ref exceeds the 2048-code-point limit.',
      retryable: false,
      details: { kind: 'evidence.ref', index: 0, limit: 2_048 },
    },
    attempts: 1,
  });
});

test('rejects an evidence summary longer than its Unicode code-point limit', async () => {
  const evidenceDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/evidence-summary', version: '1.0.0' },
    handler: async (input) => ({
      value: { echoed: input.message },
      evidence: [{ kind: 'artifact', ref: 'artifact-1', summary: 'x'.repeat(4_097) }],
    }),
  });
  const registry = createScriptRegistry();
  const script = registry.register(evidenceDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-evidence-summary',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence summary exceeds the 4096-code-point limit.',
      retryable: false,
      details: { kind: 'evidence.summary', index: 0, limit: 4_096 },
    },
    attempts: 1,
  });
});

test('returns an event-sink failure when the terminal failure event is rejected', async () => {
  const failingDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/terminal-event', version: '1.0.0' },
    handler: async () => {
      throw new ScriptFault('revo.script.provider.unavailable', 'Provider is unavailable.');
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(failingDefinition);
  registry.seal();
  const acceptedEvents: ScriptEvent[] = [];
  const sink: EventSink = {
    emit: async (event) => {
      if (event.name === 'revo.script.failed') {
        throw new Error('sink unavailable');
      }

      acceptedEvents.push(event);
    },
  };

  const execution = executeScript(registry, script, {
    executionId: 'execution-terminal-event',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  await expect(execution).resolves.toEqual({
    ok: false,
    error: {
      code: 'revo.script.execution.event_sink',
      message: 'Event sink rejected a script event.',
      retryable: false,
    },
    attempts: 1,
  });
  expect(acceptedEvents.map((event) => event.name)).toEqual(['revo.script.started']);
});

test('returns an event-sink failure when the retrying event is rejected', async () => {
  let invocationCount = 0;
  const retryDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/retry-event',
      summary: 'Retries one transient failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/retry-event', version: '1.0.0' },
    handler: async () => {
      invocationCount += 1;
      throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
        retryable: true,
      });
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(retryDefinition);
  registry.seal();
  const acceptedEvents: ScriptEvent[] = [];
  const sink: EventSink = {
    emit: async (event) => {
      if (event.name === 'revo.script.retrying') {
        throw new Error('sink unavailable');
      }

      acceptedEvents.push(event);
    },
  };

  const result = await executeScript(registry, script, {
    executionId: 'execution-retry-event',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({
    result,
    invocationCount,
    eventNames: acceptedEvents.map((event) => event.name),
  }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.event_sink',
        message: 'Event sink rejected a script event.',
        retryable: false,
      },
      attempts: 1,
    },
    invocationCount: 1,
    eventNames: ['revo.script.started'],
  });
});

test('converts an unexpected retry scheduler failure into a terminal failure', async () => {
  const retryDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/retry-scheduler',
      summary: 'Retries one transient failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/retry-scheduler', version: '1.0.0' },
    handler: async () => {
      throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
        retryable: true,
      });
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(retryDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();
  const clock = {
    now: () => 1_000,
    sleep: async () => {
      throw new Error('clock unavailable');
    },
  };

  const result = await executeScript(registry, script, {
    executionId: 'execution-retry-scheduler',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.unexpected',
        message: 'Script retry scheduling failed unexpectedly.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.retrying', 'revo.script.failed'],
  });
});

test('does not leave an unhandled deadline rejection after an early input failure', async () => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();
  const { sink } = createRecordingSink();
  const controller = new AbortController();
  controller.abort(new Error('caller cancelled'));
  const unhandled: unknown[] = [];
  const captureUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', captureUnhandled);

  try {
    const result = await executeScript(registry, script, {
      executionId: 'execution-early-input-failure',
      input: { message: 'x'.repeat(1_048_577) },
      resources: {},
      eventSink: sink,
      clock: fixedClock,
      signal: controller.signal,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect({ result, unhandled }).toEqual({
      result: {
        ok: false,
        error: {
          code: 'revo.script.execution.aborted',
          message: 'Script execution was aborted.',
          retryable: false,
        },
        attempts: 0,
      },
      unhandled: [],
    });
  } finally {
    process.off('unhandledRejection', captureUnhandled);
  }
});

test('fails closed when typed fault details are not JSON-compatible', async () => {
  const failingDefinition = defineScript({
    ...definition,
    implementation: { id: '@revisium/revo-scripts/test/fault-details', version: '1.0.0' },
    handler: async () => {
      throw new ScriptFault('revo.script.provider.unavailable', 'Provider is unavailable.', {
        details: { callback: () => undefined },
      });
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(failingDefinition);
  registry.seal();
  const { sink } = createRecordingSink();

  const execution = executeScript(registry, script, {
    executionId: 'execution-invalid-fault-details',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  await expect(execution).resolves.toEqual({
    ok: false,
    error: {
      code: 'revo.script.provider.unavailable',
      message: 'Provider is unavailable.',
      retryable: false,
      details: { redacted: '[INVALID_OR_OVERSIZED_DETAILS]' },
    },
    attempts: 1,
  });
});

test('rejects an undeclared empty-container event detail path', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/empty-event-detail',
      summary: 'Emits one declared test event.',
      events: { allowed: ['test.empty-detail'], detailPaths: [] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/empty-event-detail', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.empty-detail', details: { privateMetadata: {} } });
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(eventDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-empty-event-detail',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.permission.event',
        message:
          'Custom event detail path /privateMetadata is not declared by the script manifest.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});

test('bounds a success EventSink that never settles by the wall-clock deadline', async () => {
  const timeoutDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/hanging-event-sink',
      summary: 'Bounds one hanging event sink.',
      timeout: { wallClockMs: 20 },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/hanging-event-sink', version: '1.0.0' },
    handler: async (input) => ({ value: { echoed: input.message } }),
  });
  const registry = createScriptRegistry();
  const script = registry.register(timeoutDefinition);
  registry.seal();
  const sink: EventSink = {
    emit: async (event) => {
      if (event.name === 'revo.script.succeeded') {
        await new Promise(() => undefined);
      }
    },
  };

  const result = await Promise.race([
    executeScript(registry, script, {
      executionId: 'execution-hanging-event-sink',
      input: { message: 'hello' },
      resources: {},
      eventSink: sink,
    }),
    new Promise<'still-pending'>((resolve) => {
      setTimeout(() => resolve('still-pending'), 100);
    }),
  ]);

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.timeout.deadline',
      message: 'Script wall-clock deadline expired.',
      retryable: false,
    },
    attempts: 1,
  });
});

test('returns a stable event-validation failure for non-JSON custom details', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...definition.manifest,
      id: 'script:test/non-json-event',
      summary: 'Emits one declared test event.',
      events: { allowed: ['test.non-json'], detailPaths: ['/count'] },
    },
    inputSchema,
    resultSchema,
    implementation: { id: '@revisium/revo-scripts/test/non-json-event', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.non-json', details: { count: 1n } });
      return { value: { echoed: input.message } };
    },
  });
  const registry = createScriptRegistry();
  const script = registry.register(eventDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-non-json-event',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.event',
        message: 'Script event must be JSON-compatible.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});

test('converts an immutable-view failure into a structured preflight result', async () => {
  const transformedInputSchema: ScriptSchema<{ message: string }> = {
    ...inputSchema,
    validate: async () => ({
      ok: true,
      value: Object.defineProperty({ message: 'hello' }, 'unstable', {
        enumerable: true,
        get: () => {
          throw new Error('getter failed');
        },
      }),
    }),
  };
  const immutableDefinition = defineScript({
    ...definition,
    inputSchema: transformedInputSchema,
    implementation: { id: '@revisium/revo-scripts/test/immutable-input', version: '1.0.0' },
  });
  const registry = createScriptRegistry();
  const script = registry.register(immutableDefinition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'execution-immutable-input',
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.unexpected',
        message: 'Script validated input could not be made immutable.',
        retryable: false,
      },
      attempts: 0,
    },
    eventNames: ['revo.script.failed'],
  });
});

test('bounds an invalid execution id before projecting it into a lifecycle event', async () => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();
  const { events, sink } = createRecordingSink();

  const result = await executeScript(registry, script, {
    executionId: 'x'.repeat(70_000),
    input: { message: 'hello' },
    resources: {},
    eventSink: sink,
    clock: fixedClock,
  });

  const failure = {
    code: 'revo.script.validation.input',
    message: 'Execution id must contain between 1 and 256 Unicode code points.',
    retryable: false,
  } as const;

  expect({ result, events }).toEqual({
    result: { ok: false, error: failure, attempts: 0 },
    events: [
      {
        name: 'revo.script.failed',
        details: {
          executionId: '[INVALID_EXECUTION_ID]',
          scriptId: 'script:test/echo',
          scriptVersion: '1.0.0',
          definitionDigest: definition.definitionDigest,
          attempt: 0,
          timestampMs: 1_000,
          durationMs: 0,
          error: failure,
        },
      },
    ],
  });
});
