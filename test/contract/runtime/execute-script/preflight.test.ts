import { expect, test } from 'vitest';

import { createScriptRegistry } from '../../../../src/core/registry/script-registry.js';
import { defineScript } from '../../../../src/core/runtime/define-script.js';
import { executeScript } from '../../../../src/core/runtime/execute-script.js';
import type { ScriptSchema } from '../../../../src/core/spec/script-schema.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import {
  createRecordingEventSink,
  executeRuntimeScenario,
  fixedClock,
} from '../../../support/runtime/runtime-mechanics.js';

test('returns one structured preflight failure without a started event', async () => {
  const { events, result } = await executeRuntimeScenario(echoDefinition, {
    executionId: 'execution-2',
    input: { message: 42 },
    resources: {},
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
        definitionDigest: echoDefinition.definitionDigest,
        attempt: 0,
        timestampMs: 1_000,
        durationMs: 0,
        error: failure,
      },
    },
  ]);
});

test('rejects a missing prepared resource before invoking the handler', async () => {
  let invoked = false;
  const resourceDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/resource',
      summary: 'Reads one prepared repository resource.',
      effectClass: 'read',
      permissions: ['git.status.read'],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      effects: ['git.read'],
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/resource', version: '1.0.0' },
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const { events, result } = await executeRuntimeScenario(resourceDefinition, {
    executionId: 'execution-5',
    input: { message: 'not-run' },
    resources: {},
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
      ...echoDefinition.manifest,
      id: 'script:test/mutation',
      summary: 'Performs one idempotent test mutation.',
      effectClass: 'write',
      permissions: ['git.test.write'],
      resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
      effects: ['git.write'],
      idempotency: 'required',
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/mutation', version: '1.0.0' },
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const { events, result } = await executeRuntimeScenario(mutationDefinition, {
    executionId: 'execution-6',
    input: { message: 'not-run' },
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: { permissions: ['git.test.write'], effects: ['git.write'] },
        clients: {},
      },
    },
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

test('converts an unexpected input-validator rejection into a preflight failure', async () => {
  const rejectingInputSchema: ScriptSchema<{ message: string }> = {
    ...echoInputSchema,
    validate: async () => {
      throw new Error('validator internals');
    },
  };
  const validatorDefinition = defineScript({
    ...echoDefinition,
    inputSchema: rejectingInputSchema,
    implementation: { id: '@revisium/revo-scripts/test/validator', version: '1.0.0' },
  });
  const { events, result } = await executeRuntimeScenario(validatorDefinition, {
    executionId: 'execution-validator-rejection',
    input: { message: 'not-leaked' },
    resources: {},
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

test('returns a structured preflight failure for a foreign registry handle', async () => {
  const owningRegistry = createScriptRegistry();
  const foreignScript = owningRegistry.register(echoDefinition);
  owningRegistry.seal();
  const executingRegistry = createScriptRegistry();
  executingRegistry.seal();
  const { events, sink } = createRecordingEventSink();

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
          definitionDigest: echoDefinition.definitionDigest,
          attempt: 0,
          timestampMs: 1_000,
          durationMs: 0,
          error: failure,
        },
      },
    ],
  });
});

test('converts an immutable-view failure into a structured preflight result', async () => {
  const transformedInputSchema: ScriptSchema<{ message: string }> = {
    ...echoInputSchema,
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
    ...echoDefinition,
    inputSchema: transformedInputSchema,
    implementation: { id: '@revisium/revo-scripts/test/immutable-input', version: '1.0.0' },
  });
  const { events, result } = await executeRuntimeScenario(immutableDefinition, {
    executionId: 'execution-immutable-input',
    input: { message: 'hello' },
    resources: {},
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
  const { events, result } = await executeRuntimeScenario(echoDefinition, {
    executionId: 'x'.repeat(70_000),
    input: { message: 'hello' },
    resources: {},
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
          definitionDigest: echoDefinition.definitionDigest,
          attempt: 0,
          timestampMs: 1_000,
          durationMs: 0,
          error: failure,
        },
      },
    ],
  });
});
