import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test, vi } from 'vitest';

import {
  AttemptCancellationResultSchema,
  createRevoScripts,
  defineScript,
  ScriptAttemptResultSchema,
  ScriptReconciliationResultSchema,
  type ScriptHandler,
  type ScriptResourceMap,
} from '../../../src/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type FixtureName =
  | 'uncertain-timeout'
  | 'uncertain-cancellation'
  | 'reconciliation-uncertain'
  | 'cancellation-uncertain'
  | 'reconciliation-terminal'
  | 'reconciliation-unknown'
  | 'cancellation-already-terminal'
  | 'cancellation-unknown';

const expectedHashes: Readonly<Record<FixtureName, string>> = {
  'uncertain-timeout': '93e05e1a26f2976eaadc3cdae15abb3479f42b12cf79d00e974e74cc0014307c',
  'uncertain-cancellation': '5eab5ca87eb07a12d08d9297b32a80bf5e628d00204d1b44ccbf77d062f852a4',
  'reconciliation-uncertain': '3ce8f7c2e7011e7bc93d240a486e1fedc4f70c303208dda4e4002399a09feb1b',
  'cancellation-uncertain': '7d8751a6b61953fa90f2147734854fd532be5ae3dec7a4f78585b4b08875e162',
  'reconciliation-terminal': 'c1ab842f089a35871da9d219fe62a38ad82d53c3eec76e5d450b5f4c7783915f',
  'reconciliation-unknown': '2cb6a556c3be4feb4c2ce9a6ff69cd3c5b20b1aeb4f0c094fdd5f3d5ae87181c',
  'cancellation-already-terminal':
    '64b5e9fa097e91ab9de4c3e95ad973c9dc480fb357f9e351998044a67539c59f',
  'cancellation-unknown': '2cb6a556c3be4feb4c2ce9a6ff69cd3c5b20b1aeb4f0c094fdd5f3d5ae87181c',
};

const fixtureNames = [
  'uncertain-timeout',
  'uncertain-cancellation',
  'reconciliation-uncertain',
  'cancellation-uncertain',
  'reconciliation-terminal',
  'reconciliation-unknown',
  'cancellation-already-terminal',
  'cancellation-unknown',
] as const satisfies readonly FixtureName[];

const readFixture = async (
  name: FixtureName,
): Promise<{ readonly text: string; readonly value: unknown }> => {
  const text = await readFile(new URL(`./goldens/${name}.json`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) as unknown };
};

const assertPortableFixture = (text: string, name: FixtureName): void => {
  expect(text).not.toMatch(/secret|absolutePath|\/tmp\/|"cause"/i);
  expect(createHash('sha256').update(text).digest('hex')).toBe(expectedHashes[name]);
};

type EchoHandler = ScriptHandler<{ message: string }, { echoed: string }, ScriptResourceMap>;

const createFacade = (handler: EchoHandler) => {
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/uncertain-goldens',
      version: 1,
      summary: 'Produces public uncertain-observation goldens.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: 25 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/uncertain-goldens',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000085',
    },
    handler,
  });
  return createRevoScripts({
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
      workspaces: { inspect: async () => undefined, acquire: unavailable },
      credentials: { inspect: async () => undefined, acquire: unavailable },
      clock: { now: () => 123, sleep: async () => undefined },
    },
  });
};

const unavailable = async (): Promise<never> => {
  throw new Error('This golden fixture does not acquire a host handle.');
};

const prepare = async (
  scripts: ReturnType<typeof createFacade>,
  controller: AbortController,
  executionId: string,
  attemptId: string,
) => {
  const binding = await scripts.prepareBinding(
    { script: { id: 'script:test/uncertain-goldens', version: 1 }, resources: {}, credentials: {} },
    { signal: controller.signal },
  );
  return {
    executionId,
    attemptId,
    attemptOrdinal: 1,
    script: binding.script,
    binding,
    input: { message: 'golden' },
  };
};

const assertFixtureSchema = async (name: FixtureName, value: unknown): Promise<void> => {
  if (name.startsWith('uncertain-')) {
    expect((await ScriptAttemptResultSchema.validate(value)).ok).toBe(true);
  } else if (name.startsWith('reconciliation-')) {
    expect((await ScriptReconciliationResultSchema.validate(value)).ok).toBe(true);
  } else {
    expect((await AttemptCancellationResultSchema.validate(value)).ok).toBe(true);
  }
};

const observeUncertain = async (
  trigger: 'timeout' | 'cancellation',
): Promise<Partial<Record<FixtureName, unknown>>> => {
  let entered: (() => void) | undefined;
  let release: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const scripts = createFacade({
    execute: async () =>
      await new Promise<{ value: { echoed: string } }>((resolve) => {
        release = () => resolve({ value: { echoed: 'late' } });
        entered?.();
      }),
  });
  const controller = new AbortController();
  const input = await prepare(scripts, controller, `run-${trigger}`, `attempt-${trigger}`);
  const execution = scripts.executeAttempt(input, {
    signal: controller.signal,
    events: { emit: async (): Promise<void> => undefined },
  });
  await started;
  if (trigger === 'timeout') {
    await vi.advanceTimersByTimeAsync(1_025);
  } else {
    controller.abort(new Error('Cancelled by the consumer.'));
    await vi.advanceTimersByTimeAsync(1_000);
  }
  const result = await execution;
  const observation: Partial<Record<FixtureName, unknown>> = {
    [`uncertain-${trigger}`]: result,
  };
  if (trigger === 'timeout') {
    observation['reconciliation-uncertain'] = await scripts.reconcileAttempt(input, {
      signal: controller.signal,
    });
  } else {
    observation['cancellation-uncertain'] = await scripts.cancelAttempt(
      { executionId: input.executionId, attemptId: input.attemptId },
      { signal: controller.signal },
    );
  }
  release?.();
  await vi.advanceTimersByTimeAsync(0);
  return observation;
};

test('keeps uncertain, cancellation, and reconciliation fixtures produced by the facade', async () => {
  vi.useFakeTimers();
  try {
    const observations: Partial<Record<FixtureName, unknown>> = {};
    Object.assign(observations, await observeUncertain('timeout'));
    Object.assign(observations, await observeUncertain('cancellation'));

    const controller = new AbortController();
    const scripts = createFacade({
      execute: async (input) => ({ value: { echoed: input.message } }),
    });
    const settled = await prepare(scripts, controller, 'run-settled', 'attempt-settled');
    const settledResult = await scripts.executeAttempt(settled, {
      signal: controller.signal,
      events: { emit: async (): Promise<void> => undefined },
    });
    const unknown = await prepare(scripts, controller, 'run-unknown', 'attempt-unknown');
    observations['reconciliation-terminal'] = await scripts.reconcileAttempt(settled, {
      signal: controller.signal,
    });
    observations['reconciliation-unknown'] = await scripts.reconcileAttempt(unknown, {
      signal: controller.signal,
    });
    observations['cancellation-already-terminal'] = await scripts.cancelAttempt(
      { executionId: settled.executionId, attemptId: settled.attemptId },
      { signal: controller.signal },
    );
    observations['cancellation-unknown'] = await scripts.cancelAttempt(
      { executionId: unknown.executionId, attemptId: unknown.attemptId },
      { signal: controller.signal },
    );
    void settledResult;

    await Promise.all(
      fixtureNames.map(async (name) => {
        const fixture = await readFixture(name);
        assertPortableFixture(fixture.text, name);
        await assertFixtureSchema(name, fixture.value);
        expect(observations[name]).toEqual(fixture.value);
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});
