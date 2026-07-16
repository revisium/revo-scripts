import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import { executeScript } from '../../../../src/runtime/execution/execute-script.js';
import { ScriptFault } from '../../../../src/runtime/spec/errors/index.js';
import type { EventSink, ScriptEvent } from '../../../../src/runtime/spec/events/index.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import {
  executeRuntimeScenario,
  fixedClock,
  registerTestScript,
} from '../../../support/runtime/runtime-mechanics.js';

test('retries only an explicitly transient typed failure within the manifest policy', async () => {
  let invocationCount = 0;
  const retryDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/retry',
      summary: 'Retries one transient test failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/retry',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000013',
    },
    handler: {
      execute: async (input, context) => {
        invocationCount += 1;

        if (context.attempt === 1) {
          throw new ScriptFault('revo.script.provider.transient', 'Provider is temporarily busy.', {
            retryable: true,
          });
        }

        return { value: { echoed: input.message } };
      },
    },
  });
  const sleeps: number[] = [];
  let now = 1_000;
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };

  const { events, result } = await executeRuntimeScenario(retryDefinition, {
    executionId: 'execution-4',
    input: { message: 'eventual-success' },
    resources: {},
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
        scriptVersion: 1,
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
        scriptVersion: 1,
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
        scriptVersion: 1,
        definitionDigest: retryDefinition.definitionDigest,
        attempt: 2,
        timestampMs: 1_010,
        durationMs: 10,
      },
    },
  ]);
});

test('does not start retry backoff that cannot fit inside the total deadline', async () => {
  const retryDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/retry-deadline',
      summary: 'Stops retries at the total deadline.',
      timeout: { wallClockMs: 5 },
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/retry-deadline',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000014',
    },
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
          retryable: true,
        });
      },
    },
  });
  const sleeps: number[] = [];
  const clock = {
    now: () => 1_000,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };

  const { result } = await executeRuntimeScenario(retryDefinition, {
    executionId: 'execution-retry-deadline',
    input: { message: 'hello' },
    resources: {},
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

test('returns an event-sink failure when the retrying event is rejected', async () => {
  let invocationCount = 0;
  const retryDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/retry-event',
      summary: 'Retries one transient failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/retry-event',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000015',
    },
    handler: {
      execute: async () => {
        invocationCount += 1;
        throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
          retryable: true,
        });
      },
    },
  });
  const { registry, script } = registerTestScript(retryDefinition);
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
      ...echoDefinition.manifest,
      id: 'script:test/retry-scheduler',
      summary: 'Retries one transient failure.',
      retry: { mode: 'transient', maxAttempts: 2, backoffMs: [10] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/retry-scheduler',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000016',
    },
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.transient', 'Provider is busy.', {
          retryable: true,
        });
      },
    },
  });
  const clock = {
    now: () => 1_000,
    sleep: async () => {
      throw new Error('clock unavailable');
    },
  };

  const { events, result } = await executeRuntimeScenario(retryDefinition, {
    executionId: 'execution-retry-scheduler',
    input: { message: 'hello' },
    resources: {},
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
