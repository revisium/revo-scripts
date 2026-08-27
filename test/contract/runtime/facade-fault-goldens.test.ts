import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test } from 'vitest';

import type { ScriptProviderModule } from '../../../src/host/providers/script-provider-module.js';
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

type ScenarioKind = 'cleanup-over-handler' | 'cleanup-over-event-sink';

interface Observation {
  readonly result: unknown;
  readonly events: readonly ScriptEventEmission[];
}

const isObservation = (value: unknown): value is Observation =>
  typeof value === 'object' &&
  value !== null &&
  'result' in value &&
  'events' in value &&
  Array.isArray(value.events);

const expectedHashes: Readonly<Record<ScenarioKind, string>> = {
  'cleanup-over-handler': '0d7a906e36f2aed08fda520eb20203d4a6c0a90227d4d010c95a5552320f64bf',
  'cleanup-over-event-sink': 'f29f7a04e7122bdc2f9442c5b66c25a1c8ac7343f0a2c59d91692ee4cb9d6e96',
};

const readGolden = async (
  kind: ScenarioKind,
): Promise<{ readonly text: string; readonly value: unknown }> => {
  const text = await readFile(new URL(`./goldens/facade-${kind}.json`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) as unknown };
};

const createScenario = (kind: ScenarioKind) => {
  const provider: ScriptProviderModule = {
    id: 'provider:test/facade-fault-goldens',
    contract: 'revo.provider.test/v1',
    implementationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000087',
    provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
    operations: ['git.read'],
    workspace: 'none',
    createResourceClients: async () => ({
      clients: {},
      dispose: async () => {
        throw new Error('Provider cleanup failed.');
      },
    }),
  };
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: `script:test/facade-${kind}`,
      version: 1,
      summary: 'Produces a public fault-precedence golden.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'read',
      permissions: [],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      providers: [{ name: 'test', contract: 'revo.provider.test/v1', resource: 'repository' }],
      credentials: [],
      operations: ['git.read'],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events:
        kind === 'cleanup-over-event-sink'
          ? { allowed: ['consumer.progress'], detailPaths: ['/phase'] }
          : { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: `@revisium/revo-scripts/test/facade-${kind}`,
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000088',
    },
    handler: {
      execute: async (input, context) => {
        if (kind === 'cleanup-over-handler') {
          throw new ScriptFault(
            'revo.script.provider.rejected',
            'Provider rejected the operation.',
          );
        }
        if (kind === 'cleanup-over-event-sink') {
          await context.emit({
            name: 'consumer.progress',
            details: { phase: 'before-cleanup' },
          });
        }
        return { value: { echoed: input.message } };
      },
    },
  });
  return {
    definition,
    scripts: createRevoScripts({
      definitions: [
        {
          id: definition.implementation.id,
          provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
          registerInto: (registrar) => registrar.register(definition),
        },
      ],
      providers: [{ module: provider }],
      host: {
        resources: {
          inspect: async () => ({
            resourceId: 'resource:test',
            kind: 'repository',
            repositoryId: 'repository:test',
            providerCoordinates: {},
            grant: { permissions: [], operations: ['git.read'] },
          }),
        },
        workspaces: { inspect: async () => undefined, acquire: unavailable },
        credentials: { inspect: async () => undefined, acquire: unavailable },
        clock: { now: () => 123, sleep: async () => undefined },
      },
    }),
  };
};

const unavailable = async (): Promise<never> => {
  throw new Error('This facade golden does not acquire a host handle.');
};

const observe = async (kind: ScenarioKind): Promise<Observation> => {
  const scenario = createScenario(kind);
  const controller = new AbortController();
  const binding = await scenario.scripts.prepareBinding(
    {
      script: {
        id: scenario.definition.manifest.id,
        version: scenario.definition.manifest.version,
      },
      resources: { repository: { resourceRef: 'resource:test' } },
      credentials: {},
    },
    { signal: controller.signal },
  );
  const events: ScriptEventEmission[] = [];
  const result = await scenario.scripts.executeAttempt(
    {
      executionId: `facade-${kind}`,
      attemptId: `facade-${kind}:1`,
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'golden' },
    },
    {
      signal: controller.signal,
      events: {
        emit: async (emission) => {
          if (kind === 'cleanup-over-event-sink' && emission.event.name === 'consumer.progress') {
            throw new Error('Consumer event sink failed.');
          }
          events.push(structuredClone(emission));
        },
      },
    },
  );
  return { result, events };
};

for (const kind of ['cleanup-over-handler', 'cleanup-over-event-sink'] as const) {
  test(`keeps ${kind} produced by the public facade`, async () => {
    const golden = await readGolden(kind);
    expect(golden.text).not.toMatch(/secret|absolutePath|\/tmp\/|"cause"/i);
    expect(createHash('sha256').update(golden.text).digest('hex')).toBe(expectedHashes[kind]);
    if (!isObservation(golden.value)) {
      throw new Error(`Facade ${kind} golden has an invalid observation shape.`);
    }
    expect((await ScriptAttemptResultSchema.validate(golden.value.result)).ok).toBe(true);
    await Promise.all(
      golden.value.events.map(async (emission) => {
        expect((await ScriptEventSchema.validate(emission.event)).ok).toBe(true);
      }),
    );
    await expect(observe(kind)).resolves.toEqual(golden.value);
  });
}
