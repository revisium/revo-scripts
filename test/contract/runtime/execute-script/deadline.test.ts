import { expect, test, vi } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import { executeScript } from '../../../../src/runtime/execution/execute-script.js';
import type { EventSink } from '../../../../src/runtime/spec/events/index.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import {
  createRecordingEventSink,
  executeRuntimeScenario,
  registerTestScript,
} from '../../../support/runtime/runtime-mechanics.js';

test('aborts an active handler at the total wall-clock deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);

  try {
    const timeoutDefinition = defineScript({
      manifest: {
        ...echoDefinition.manifest,
        id: 'script:test/timeout',
        summary: 'Waits until the runtime deadline aborts the handler.',
        timeout: { wallClockMs: 50 },
      },
      inputSchema: echoInputSchema,
      resultSchema: echoResultSchema,
      implementation: {
        id: '@revisium/revo-scripts/test/timeout',
        version: '1.0.0',
        buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000032',
      },
      handler: {
        execute: async (_input, context) =>
          new Promise((_resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason), {
              once: true,
            });
          }),
      },
    });
    const { registry, script } = registerTestScript(timeoutDefinition);
    const { events, sink } = createRecordingEventSink();
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

test('does not leave an unhandled deadline rejection after an early input failure', async () => {
  const controller = new AbortController();
  controller.abort(new Error('caller cancelled'));
  const unhandled: unknown[] = [];
  const captureUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', captureUnhandled);

  try {
    const { result } = await executeRuntimeScenario(echoDefinition, {
      executionId: 'execution-early-input-failure',
      input: { message: 'x'.repeat(1_048_577) },
      resources: {},
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

test('bounds a success EventSink that never settles by the wall-clock deadline', async () => {
  const timeoutDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/hanging-event-sink',
      summary: 'Bounds one hanging event sink.',
      timeout: { wallClockMs: 20 },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/hanging-event-sink',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000033',
    },
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
  });
  const { registry, script } = registerTestScript(timeoutDefinition);
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
