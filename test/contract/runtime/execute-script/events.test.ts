import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/core/runtime/define-script.js';
import { executeScript } from '../../../../src/core/runtime/execute-script.js';
import { ScriptFault } from '../../../../src/core/spec/script-errors.js';
import type { EventSink, ScriptEvent } from '../../../../src/core/spec/script-events.js';
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

test('redacts custom events and typed failure details before they leave the runtime', async () => {
  const failingDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/failure',
      summary: 'Emits one event and reports a provider failure.',
      redaction: {
        ...echoDefinition.manifest.redaction,
        errorPaths: ['/secret'],
        eventPaths: ['/secret'],
      },
      events: {
        allowed: ['test.provider.observed'],
        detailPaths: ['/secret', '/visible'],
      },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
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
  const { events, result } = await executeRuntimeScenario(failingDefinition, {
    executionId: 'execution-3',
    input: { message: 'sensitive-value' },
    resources: {},
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

test('returns an event-sink failure without invoking the handler or re-emitting', async () => {
  let invoked = false;
  let sinkCalls = 0;
  const sinkFailureDefinition = defineScript({
    ...echoDefinition,
    handler: async (input) => {
      invoked = true;
      return { value: { echoed: input.message } };
    },
  });
  const { registry, script } = registerTestScript(sinkFailureDefinition);
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

test('rejects an undeclared custom event before it reaches the sink', async () => {
  const eventDefinition = defineScript({
    ...echoDefinition,
    implementation: { id: '@revisium/revo-scripts/test/undeclared-event', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.undeclared' });
      return { value: { echoed: input.message } };
    },
  });
  const { events, result } = await executeRuntimeScenario(eventDefinition, {
    executionId: 'execution-undeclared-event',
    input: { message: 'hello' },
    resources: {},
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

test('returns an event-sink failure when the terminal failure event is rejected', async () => {
  const failingDefinition = defineScript({
    ...echoDefinition,
    implementation: { id: '@revisium/revo-scripts/test/terminal-event', version: '1.0.0' },
    handler: async () => {
      throw new ScriptFault('revo.script.provider.unavailable', 'Provider is unavailable.');
    },
  });
  const { registry, script } = registerTestScript(failingDefinition);
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

test('rejects an undeclared empty-container event detail path', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/empty-event-detail',
      summary: 'Emits one declared test event.',
      events: { allowed: ['test.empty-detail'], detailPaths: [] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/empty-event-detail', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.empty-detail', details: { privateMetadata: {} } });
      return { value: { echoed: input.message } };
    },
  });
  const { events, result } = await executeRuntimeScenario(eventDefinition, {
    executionId: 'execution-empty-event-detail',
    input: { message: 'hello' },
    resources: {},
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

test('returns a stable event-validation failure for non-JSON custom details', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/non-json-event',
      summary: 'Emits one declared test event.',
      events: { allowed: ['test.non-json'], detailPaths: ['/count'] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/non-json-event', version: '1.0.0' },
    handler: async (input, context) => {
      await context.emit({ name: 'test.non-json', details: { count: 1n } });
      return { value: { echoed: input.message } };
    },
  });
  const { events, result } = await executeRuntimeScenario(eventDefinition, {
    executionId: 'execution-non-json-event',
    input: { message: 'hello' },
    resources: {},
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
