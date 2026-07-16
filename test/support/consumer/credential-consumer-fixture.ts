import { z } from 'zod';

import type {
  ProviderClientRequest,
  RevoScriptsHost,
  ScriptCredentialBinding,
  ScriptProviderRegistration,
} from '../../../src/host/index.js';
import {
  createRevoScripts,
  createScriptSchema,
  defineScript,
  type RevoScriptExecutionRequest,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import type { ScriptEvent, ScriptResourceHandle } from '../../../src/runtime/spec/index.js';

interface CredentialAliasClient {
  readAlias(): Promise<string>;
}

interface CredentialFixtureObservations {
  readonly credentialBindings: ScriptCredentialBinding[];
  readonly providerRequests: ProviderClientRequest[];
  readonly events: ScriptEvent[];
  credentialDisposals: number;
  providerDisposals: number;
}

const inputSchema = createScriptSchema({
  id: 'revo.script.test.credential-alias.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const resultSchema = createScriptSchema({
  id: 'revo.script.test.credential-alias.result/v1',
  schema: z.strictObject({ alias: z.string() }),
  jsonSchema: 'output',
});

const credentialAliasScript = defineScript<
  Record<string, never>,
  Readonly<{ alias: string }>,
  Readonly<{
    repository: ScriptResourceHandle<Readonly<{ credentialAlias: CredentialAliasClient }>>;
  }>
>({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:test/credential-alias',
    version: 1,
    summary: 'Reads non-secret credential metadata through a bounded provider client.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'read',
    permissions: ['github.metadata.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    providers: [
      {
        name: 'credentials',
        contract: 'revo.provider.test-credentials/v1',
        resource: 'repository',
      },
    ],
    credentials: [{ name: 'token', provider: 'github', providerRequirement: 'credentials' }],
    effects: ['github.read'],
    timeout: { wallClockMs: 5_000 },
    retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
    idempotency: 'read-only',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  },
  inputSchema,
  resultSchema,
  implementation: {
    id: '@revisium/revo-scripts/test/credential-alias',
    version: '1.0.0',
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000002',
  },
  handler: {
    execute: async (_input, context) => ({
      value: {
        alias: await context.resources.repository.clients.credentialAlias.readAlias(),
      },
    }),
  },
});

const credentialDefinitions = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/test/credential-definitions',
  provenance: {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0-test',
  },
  registerInto: (registrar) => {
    registrar.register(credentialAliasScript);
  },
});

const credentialProvider = (
  observations: CredentialFixtureObservations,
): ScriptProviderRegistration => ({
  module: {
    id: 'provider:test-credentials/memory',
    contract: 'revo.provider.test-credentials/v1',
    implementationDigest: `sha256:${'1'.repeat(64)}`,
    provenance: {
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0-test',
    },
    effects: ['github.read'],
    workspace: 'none',
    createResourceClients: async (request) => {
      observations.providerRequests.push(request);
      const credential = request.credentials.token;

      if (credential === undefined) {
        throw new Error('Expected the token credential to be resolved before provider creation.');
      }

      return {
        clients: {
          credentialAlias: {
            readAlias: async () => credential.alias,
          },
        },
        dispose: async () => {
          observations.providerDisposals += 1;
        },
      };
    },
  },
});

const credentialHost = (
  observations: CredentialFixtureObservations,
  abortAfterResolution: AbortController | undefined,
): RevoScriptsHost => ({
  workspaces: {
    resolve: async () => {
      throw new Error('A workspace-free provider must not resolve a workspace.');
    },
  },
  credentials: {
    resolve: async (binding) => {
      observations.credentialBindings.push(binding);
      abortAfterResolution?.abort(new Error('Credential resolution was cancelled.'));
      return {
        alias: binding.alias,
        provider: binding.provider,
        secret: 'fixture-secret-that-must-not-escape',
        dispose: async () => {
          observations.credentialDisposals += 1;
        },
      };
    },
  },
  events: {
    emit: async (event) => {
      observations.events.push(event);
    },
  },
  clock: {
    now: () => 1_000,
    sleep: async () => undefined,
  },
});

export interface CredentialConsumerFixture {
  readonly observations: CredentialFixtureObservations;
  readonly request: RevoScriptExecutionRequest;
  readonly scripts: ReturnType<typeof createRevoScripts>;
}

export interface CredentialConsumerFixtureOptions {
  readonly abortAfterResolution?: AbortController;
}

export const createCredentialConsumerFixture = (
  options: CredentialConsumerFixtureOptions = {},
): CredentialConsumerFixture => {
  const observations: CredentialFixtureObservations = {
    credentialBindings: [],
    providerRequests: [],
    events: [],
    credentialDisposals: 0,
    providerDisposals: 0,
  };
  const scripts = createRevoScripts({
    definitions: [credentialDefinitions()],
    providers: [credentialProvider(observations)],
    host: credentialHost(observations, options.abortAfterResolution),
  });
  const request: RevoScriptExecutionRequest = {
    executionId: 'credential-consumer-flow',
    script: { id: 'script:test/credential-alias', version: 1 },
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'read',
          grant: {
            permissions: ['github.metadata.read'],
            effects: ['github.read'],
          },
          providerCoordinates: {},
        },
      },
      credentials: {
        token: { alias: 'revo-github', provider: 'github' },
      },
    },
    ...(options.abortAfterResolution === undefined
      ? {}
      : { signal: options.abortAfterResolution.signal }),
  };

  return { observations, request, scripts };
};
