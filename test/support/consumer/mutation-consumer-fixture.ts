import { z } from 'zod';

import type { RevoScriptsHost, ScriptProviderRegistration } from '../../../src/host/index.js';
import {
  createRevoScripts,
  createScriptSchema,
  defineScript,
  type RevoScriptExecutionRequest,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import type { ScriptResourceHandle } from '../../../src/runtime/spec/index.js';

const inputSchema = createScriptSchema({
  id: 'revo.script.test.idempotent-mutation.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const resultSchema = createScriptSchema({
  id: 'revo.script.test.idempotent-mutation.result/v1',
  schema: z.strictObject({ idempotencyKey: z.string() }),
  jsonSchema: 'output',
});

const mutationScript = defineScript<
  Record<string, never>,
  Readonly<{ idempotencyKey: string }>,
  Readonly<{ repository: ScriptResourceHandle<Record<string, never>> }>
>({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:test/idempotent-mutation',
    version: '1.0.0',
    summary: 'Returns the idempotency key received by one bounded mutation.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'write',
    permissions: ['test.mutation.execute'],
    resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
    providers: [
      {
        name: 'mutation',
        contract: 'revo.provider.test-mutation/v1',
        resource: 'repository',
      },
    ],
    credentials: [],
    effects: ['git.write'],
    timeout: { wallClockMs: 5_000 },
    retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
    idempotency: 'required',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  },
  inputSchema,
  resultSchema,
  implementation: {
    id: '@revisium/revo-scripts/test/idempotent-mutation',
    version: '1.0.0',
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000004',
  },
  handler: {
    execute: async (_input, context) => {
      if (context.idempotencyKey === undefined) {
        throw new Error('Required idempotency must be validated before handler execution.');
      }

      return { value: { idempotencyKey: context.idempotencyKey } };
    },
  },
});

const mutationDefinitions = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/test/idempotent-mutation-definitions',
  provenance: {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0-test',
  },
  registerInto: (registrar) => {
    registrar.register(mutationScript);
  },
});

interface MutationObservations {
  readonly eventNames: string[];
  providerCreations: number;
  providerDisposals: number;
}

const mutationProvider = (observations: MutationObservations): ScriptProviderRegistration => ({
  module: {
    id: 'provider:test-mutation/memory',
    contract: 'revo.provider.test-mutation/v1',
    implementationDigest: `sha256:${'c'.repeat(64)}`,
    provenance: {
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0-test',
    },
    effects: ['git.write'],
    workspace: 'none',
    createResourceClients: async () => {
      observations.providerCreations += 1;
      return {
        clients: {},
        dispose: async () => {
          observations.providerDisposals += 1;
        },
      };
    },
  },
  useForNewPlans: true,
});

const mutationHost = (observations: MutationObservations): RevoScriptsHost => ({
  workspaces: {
    resolve: async () => {
      throw new Error('The mutation fixture provider does not require a workspace.');
    },
  },
  credentials: {
    resolve: async () => {
      throw new Error('The mutation fixture does not declare credentials.');
    },
  },
  events: {
    emit: async (event) => {
      observations.eventNames.push(event.name);
    },
  },
  clock: { now: () => 1_000, sleep: async () => undefined },
});

export interface MutationConsumerFixture {
  readonly observations: MutationObservations;
  readonly request: RevoScriptExecutionRequest;
  readonly scripts: ReturnType<typeof createRevoScripts>;
}

export const createMutationConsumerFixture = (): MutationConsumerFixture => {
  const observations: MutationObservations = {
    eventNames: [],
    providerCreations: 0,
    providerDisposals: 0,
  };
  const scripts = createRevoScripts({
    definitions: [mutationDefinitions()],
    providers: [mutationProvider(observations)],
    host: mutationHost(observations),
  });
  const plan = scripts.resolveForPlan({
    id: 'script:test/idempotent-mutation',
    version: '1.0.0',
  });
  const request: RevoScriptExecutionRequest = {
    executionId: 'idempotent-mutation',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'write',
          grant: {
            permissions: ['test.mutation.execute'],
            effects: ['git.write'],
          },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  };

  return { observations, request, scripts };
};
