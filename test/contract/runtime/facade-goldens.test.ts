import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test, vi } from 'vitest';

import {
  createRevoScripts,
  defineScript,
  ScriptAttemptResultSchema,
  ScriptEventSchema,
  ScriptFault,
  type ScriptEventEmission,
} from '../../../src/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type ScenarioKind = 'succeeded' | 'failed' | 'cancelled' | 'timedOut' | 'uncertain';

interface Observation {
  readonly result: unknown;
  readonly events: readonly { readonly event: unknown }[];
}

const expectedHashes: Readonly<Record<ScenarioKind, string>> = {
  succeeded: '833a9073b162ab3183b732d87282d1b150ce01cafcd1329a43edd6220aa5d397',
  failed: '479d7561f99d41f5c48649862b4bb7c5b74a9eabafcde595ad4a9e491d73b46d',
  cancelled: '91683b912c17d909d247552e9ff74cbbdcf9a9ba4c46308d060fd305b9b673b2',
  timedOut: 'cf2185614160013a44604448ffcc5bf3007cc057cdf7a0e004fee26684e6e24e',
  uncertain: 'a6eaa859d794b905612f47684a89115d247d49157091892525dd01da71b91158',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isObservation = (value: unknown): value is Observation =>
  isRecord(value) &&
  'result' in value &&
  Array.isArray(value.events) &&
  value.events.every((event) => isRecord(event) && 'event' in event);

const readGolden = async (
  kind: ScenarioKind,
): Promise<{ readonly text: string; readonly value: Observation }> => {
  const text = await readFile(new URL(`./goldens/facade-${kind}.json`, import.meta.url), 'utf8');
  const value: unknown = JSON.parse(text);
  if (!isObservation(value)) {
    throw new Error(`Facade ${kind} golden has an invalid observation shape.`);
  }
  return { text, value };
};

const assertGolden = async (
  kind: ScenarioKind,
  golden: { readonly text: string; readonly value: Observation },
) => {
  expect((await ScriptAttemptResultSchema.validate(golden.value.result)).ok).toBe(true);
  for (const emission of golden.value.events) {
    // eslint-disable-next-line no-await-in-loop -- every golden event has its own public schema proof.
    expect((await ScriptEventSchema.validate(emission.event)).ok).toBe(true);
  }
  expect(golden.text).not.toMatch(/secret|absolutePath|\/tmp\/|"cause"/i);
  expect(createHash('sha256').update(golden.text).digest('hex')).toBe(expectedHashes[kind]);
  return golden.value;
};

const observe = async (kind: ScenarioKind): Promise<Observation> => {
  const scriptName = kind === 'timedOut' ? 'timed-out' : kind;
  let handlerStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    handlerStarted = resolve;
  });
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: `script:test/facade-golden-${scriptName}`,
      version: 1,
      summary: 'Produces a public facade golden.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: kind === 'timedOut' || kind === 'uncertain' ? 25 : 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: ['consumer.progress'], detailPaths: ['/phase'] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: `@revisium/revo-scripts/test/facade-golden/${scriptName}`,
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000081',
    },
    handler: {
      execute: async (input, context) => {
        if (kind === 'failed') {
          throw new ScriptFault(
            'revo.script.provider.rejected',
            'Provider rejected the operation.',
          );
        }
        if (kind === 'timedOut' || kind === 'cancelled') {
          handlerStarted?.();
          return await new Promise<never>((_resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason), {
              once: true,
            });
          });
        }
        if (kind === 'uncertain') {
          handlerStarted?.();
          return await new Promise<never>(() => undefined);
        }
        await context.emit({ name: 'consumer.progress', details: { phase: 'handler' } });
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
      workspaces: { inspect: async () => undefined, acquire: unavailable },
      credentials: { inspect: async () => undefined, acquire: unavailable },
      clock: { now: () => 123, sleep: async () => undefined },
    },
  });
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    {
      script: { id: definition.manifest.id, version: definition.manifest.version },
      resources: {},
      credentials: {},
    },
    { signal: controller.signal },
  );
  const events: ScriptEventEmission[] = [];
  const execution = scripts.executeAttempt(
    {
      executionId: `facade-golden-${kind}`,
      attemptId: `facade-golden-${kind}:1`,
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'golden' },
    },
    {
      signal: controller.signal,
      events: {
        emit: async (emission) => {
          events.push(structuredClone(emission));
        },
      },
    },
  );

  if (kind === 'cancelled') {
    await started;
    controller.abort(new Error('Cancelled by the consumer.'));
  }
  if (kind === 'timedOut' || kind === 'uncertain') {
    await started;
    await vi.advanceTimersByTimeAsync(1_025);
  }

  return { result: await execution, events };
};

const unavailable = async (): Promise<never> => {
  throw new Error('This facade golden does not acquire host resources.');
};

for (const kind of ['succeeded', 'failed', 'cancelled'] as const) {
  test(`keeps the ${kind} result and event sequence produced by the facade`, async () => {
    const golden = await assertGolden(kind, await readGolden(kind));
    await expect(observe(kind)).resolves.toEqual(golden);
  });
}

test('keeps the timedOut result and event sequence produced by the facade', async () => {
  vi.useFakeTimers();
  try {
    const golden = await assertGolden('timedOut', await readGolden('timedOut'));
    await expect(observe('timedOut')).resolves.toEqual(golden);
  } finally {
    vi.useRealTimers();
  }
});

test('keeps the uncertain result and its non-terminal event sequence produced by the facade', async () => {
  vi.useFakeTimers();
  try {
    const golden = await assertGolden('uncertain', await readGolden('uncertain'));
    await expect(observe('uncertain')).resolves.toEqual(golden);
  } finally {
    vi.useRealTimers();
  }
});
