import { expect, test } from 'vitest';

import type {
  ScriptLiveEventEmission,
  ScriptSucceededTerminalEventEmission,
} from '../../../src/index.js';
import { defineScript } from '../../../src/runtime/definition/define-script.js';
import {
  createScriptContractHarness,
  DeterministicScriptClock,
  RecordingEventSink,
} from '../../../src/testing/index.js';
import { pureContractHarnessHost } from '../../../src/testing/runtime/default-script-contract-harness.js';
import {
  echoManifest,
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

declare const recordingSink: RecordingEventSink;
declare const succeededTerminal: ScriptSucceededTerminalEventEmission;

const assertRecordingSinkLiveBoundary = (): void => {
  // @ts-expect-error The testing sink records only events accepted by EventSink.
  void recordingSink.emit(succeededTerminal);
  const emissions: readonly ScriptLiveEventEmission[] = recordingSink.read();
  void emissions;
};

void assertRecordingSinkLiveBoundary;

const definition = defineScript({
  manifest: {
    ...echoManifest,
    id: 'script:test/testing-harness',
    events: { ...echoManifest.events, allowed: ['consumer.test'], detailPaths: ['/message'] },
  },
  inputSchema: manualEchoInputSchema,
  resultSchema: manualEchoResultSchema,
  implementation: {
    id: '@revisium/revo-scripts/test/testing-harness',
    version: '1.0.0',
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000055',
  },
  handler: {
    execute: async (input, context) => {
      await context.emit({ name: 'consumer.test', details: { message: input.message } });
      return { value: { echoed: input.message } };
    },
  },
});

test('testing harness runs a compact single attempt result shape', async () => {
  const harness = createScriptContractHarness(definition, {});

  const execution = await harness.runAttempt({ message: 'hello' });
  expect(execution).toMatchObject({
    result: {
      kind: 'succeeded',
      value: { echoed: 'hello' },
      evidence: [],
      terminalEvent: { event: { name: 'revo.script.succeeded', details: { evidenceCount: 0 } } },
    },
    events: [{ name: 'consumer.test', details: { message: 'hello' } }],
    value: { echoed: 'hello' },
  });
  await expect(harness.runAttempt({ unexpected: true })).resolves.toMatchObject({
    result: {
      kind: 'failed',
      error: { code: 'revo.script.validation.input', stage: 'acquire' },
    },
  });
  await expect(harness.runAttempt(() => undefined)).rejects.toMatchObject({
    code: 'revo.script.validation.input',
  });
});

test('testing clock and recording sink retain only detached values', async () => {
  const clock = new DeterministicScriptClock(10);
  const controller = new AbortController();
  await clock.sleep(5, controller.signal);
  expect({ now: clock.now(), sleeps: clock.readSleeps() }).toEqual({ now: 15, sleeps: [5] });
  controller.abort('stop');
  await expect(clock.sleep(1, controller.signal)).rejects.toBe('stop');

  const sink = new RecordingEventSink();
  const emission = { emissionOrdinal: 1, event: { name: 'consumer.test', details: { count: 1 } } };
  await sink.emit(emission);
  emission.event.details.count = 2;
  expect(sink.read()).toEqual([
    { emissionOrdinal: 1, event: { name: 'consumer.test', details: { count: 1 } } },
  ]);
});

test('pure contract harness host refuses live workspace and credential acquisition', async () => {
  await expect(pureContractHarnessHost.resources.inspect()).resolves.toBe(undefined);
  await expect(pureContractHarnessHost.workspaces.inspect()).resolves.toBe(undefined);
  await expect(pureContractHarnessHost.credentials.inspect()).resolves.toBe(undefined);
  await expect(pureContractHarnessHost.workspaces.acquire()).rejects.toThrow(
    'no live host resources',
  );
  await expect(pureContractHarnessHost.credentials.acquire()).rejects.toThrow(
    'no live host resources',
  );
});
