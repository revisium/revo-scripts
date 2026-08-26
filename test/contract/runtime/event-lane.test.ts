import { expect, test } from 'vitest';

import type { ScriptEventEmission } from '../../../src/application/contracts/script-attempt.js';
import { createRevoScripts } from '../../../src/application/create-revo-scripts.js';
import { defineScript } from '../../../src/runtime/definition/define-script.js';
import type { ScriptHandler } from '../../../src/runtime/spec/definition/script-handler.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type EventHandler = ScriptHandler<{ message: string }, { echoed: string }, ScriptResourceMap>;

interface EventScenarioOptions {
  readonly allowed?: readonly string[];
  readonly detailPaths?: readonly string[];
  readonly eventPaths?: readonly string[];
  readonly handler?: EventHandler;
}

const createScripts = (
  emit: (event: { name: string; details?: Record<string, unknown> }) => Promise<void>,
  {
    allowed = ['consumer.progress'],
    detailPaths = ['/secret'],
    eventPaths = ['/secret'],
    handler,
  }: EventScenarioOptions = {},
) => {
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/events',
      version: 1,
      summary: 'Emits one event.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: {
        inputPaths: [],
        resultPaths: [],
        errorPaths: [],
        eventPaths,
      },
      events: { allowed, detailPaths },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/events',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000051',
    },
    handler: {
      execute: async (input, context) => {
        if (handler !== undefined) {
          return await handler.execute(input, context);
        }
        await emit({ name: 'consumer.progress', details: { secret: 'nope' } });
        await context.emit({ name: 'consumer.progress', details: { secret: 'nope' } });
        return { value: { echoed: input.message } };
      },
    },
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: definition.implementation.id,
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => registrar.register(definition),
      },
    ],
    providers: [],
    host: {
      resources: { inspect: async () => undefined },
      workspaces: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
      credentials: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
      clock: { now: () => 123, sleep: async () => undefined },
    },
  });
  return { scripts, definition };
};

const execute = async (
  scripts: ReturnType<typeof createScripts>['scripts'],
  definition: ReturnType<typeof createScripts>['definition'],
  executionId: string,
  emit: (emission: ScriptEventEmission) => Promise<void>,
) => {
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    { script: { id: definition.manifest.id, version: 1 }, resources: {}, credentials: {} },
    { signal: controller.signal },
  );
  return await scripts.executeAttempt(
    {
      executionId,
      attemptId: `${executionId}-attempt`,
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'hi' },
    },
    { signal: controller.signal, events: { emit } },
  );
};

test('serializes lifecycle and custom events with one ordinal lane', async () => {
  const events: ScriptEventEmission[] = [];
  const { scripts, definition } = createScripts(async () => undefined);
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    { script: { id: definition.manifest.id, version: 1 }, resources: {}, credentials: {} },
    { signal: controller.signal },
  );
  const result = await scripts.executeAttempt(
    {
      executionId: 'run-events',
      attemptId: 'attempt-events',
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'hi' },
    },
    {
      signal: controller.signal,
      events: {
        emit: async (emission) => {
          events.push(emission);
        },
      },
    },
  );

  expect(result.kind).toBe('succeeded');
  expect(result).toMatchObject({
    terminalEvent: {
      emissionOrdinal: 3,
      event: { name: 'revo.script.succeeded', details: { evidenceCount: 0 } },
    },
  });
  expect(
    events.map(({ emissionOrdinal, event }) => [
      emissionOrdinal,
      event.name,
      'details' in event && event.details && 'secret' in event.details
        ? event.details.secret
        : undefined,
    ]),
  ).toEqual([
    [1, 'revo.script.started', undefined],
    [2, 'consumer.progress', '[REDACTED]'],
  ]);
});

test('an undeclared event latches a handler failure even when the handler catches it', async () => {
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/invalid-event',
      version: 1,
      summary: 'Rejects undeclared events.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/invalid-event',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000052',
    },
    handler: {
      execute: async (input, context) => {
        await context.emit({ name: 'not.allowed' }).catch(() => undefined);
        return { value: { echoed: input.message } };
      },
    },
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: definition.implementation.id,
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => registrar.register(definition),
      },
    ],
    providers: [],
    host: {
      resources: { inspect: async () => undefined },
      workspaces: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
      credentials: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
    },
  });
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    { script: { id: definition.manifest.id, version: 1 }, resources: {}, credentials: {} },
    { signal: controller.signal },
  );
  const result = await scripts.executeAttempt(
    {
      executionId: 'run-invalid',
      attemptId: 'attempt-invalid',
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'hi' },
    },
    { signal: controller.signal, events: { emit: async () => undefined } },
  );

  expect(result).toMatchObject({
    kind: 'failed',
    error: { code: 'revo.script.validation.event', stage: 'handler', retryable: false },
  });
});

test('drains a fire-and-forget custom event before the terminal event', async () => {
  const events: string[] = [];
  const { scripts, definition } = createScripts(async () => undefined, {
    detailPaths: ['/progress'],
    handler: {
      execute: async (input, context) => {
        void context.emit({ name: 'consumer.progress', details: { progress: 'queued' } });
        return { value: { echoed: input.message } };
      },
    },
  });

  const result = await execute(scripts, definition, 'run-fire-and-forget', async (emission) => {
    events.push(emission.event.name);
  });
  expect(result).toMatchObject({
    kind: 'succeeded',
    terminalEvent: { emissionOrdinal: 3, event: { name: 'revo.script.succeeded' } },
  });
  expect(events).toEqual(['revo.script.started', 'consumer.progress']);
});

test('fire-and-forget invalid custom events become structured failures without unhandled rejections', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { scripts, definition } = createScripts(async () => undefined, {
      detailPaths: ['/approved'],
      handler: {
        execute: async (input, context) => {
          void context.emit({ name: 'consumer.progress', details: { secret: 'never-authorized' } });
          return { value: { echoed: input.message } };
        },
      },
    });

    await expect(
      execute(scripts, definition, 'run-invalid-fire', async () => undefined),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'revo.script.validation.event', stage: 'handler' },
    });
    await Promise.resolve();
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('event redaction and leaf authorization are relative to details, including arrays', async () => {
  const events: ScriptEventEmission[] = [];
  const { scripts, definition } = createScripts(async () => undefined, {
    detailPaths: ['/items/0/name', '/secret'],
    eventPaths: ['/secret'],
    handler: {
      execute: async (input, context) => {
        await context.emit({
          name: 'consumer.progress',
          details: { secret: 'redact-me', items: [{ name: 'approved' }] },
        });
        return { value: { echoed: input.message } };
      },
    },
  });

  await expect(
    execute(scripts, definition, 'run-redacted-array', async (emission) => {
      events.push(emission);
    }),
  ).resolves.toMatchObject({ kind: 'succeeded' });
  expect(events[1]).toMatchObject({
    event: {
      name: 'consumer.progress',
      details: { secret: '[REDACTED]', items: [{ name: 'approved' }] },
    },
  });

  const rejected = createScripts(async () => undefined, {
    detailPaths: ['/items'],
    handler: {
      execute: async (input, context) => {
        await context.emit({
          name: 'consumer.progress',
          details: { items: [{ secret: 'hidden' }] },
        });
        return { value: { echoed: input.message } };
      },
    },
  });
  await expect(
    execute(rejected.scripts, rejected.definition, 'run-rejected-array', async () => undefined),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: { code: 'revo.script.validation.event', stage: 'handler' },
  });
});

test('fire-and-forget sink rejection is structured and has no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { scripts, definition } = createScripts(async () => undefined, {
      detailPaths: ['/progress'],
      handler: {
        execute: async (input, context) => {
          void context.emit({ name: 'consumer.progress', details: { progress: 'queued' } });
          return { value: { echoed: input.message } };
        },
      },
    });
    await expect(
      execute(scripts, definition, 'run-sink-fire', async (emission) => {
        if (emission.event.name === 'consumer.progress') {
          throw new Error('Sink refused custom event.');
        }
      }),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'revo.script.execution.event_sink', stage: 'event_sink' },
    });
    await Promise.resolve();
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
