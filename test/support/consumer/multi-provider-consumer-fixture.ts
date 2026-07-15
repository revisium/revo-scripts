import { z } from 'zod';

import type { RevoScriptsHost, ScriptProviderRegistration } from '../../../src/host/index.js';
import {
  createRevoScripts,
  createScriptSchema,
  defineScript,
  type RevoScriptExecutionRequest,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import type { ScriptSchema } from '../../../src/index.js';
import type { ScriptEffect, ScriptResourceHandle } from '../../../src/runtime/spec/index.js';

interface MultiProviderClients {
  readonly alpha?: object;
  readonly beta?: object;
  readonly shared?: object;
}

const inputSchema = createScriptSchema({
  id: 'revo.script.test.multi-provider.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const resultSchema = createScriptSchema({
  id: 'revo.script.test.multi-provider.result/v1',
  schema: z.strictObject({ completed: z.literal(true) }),
  jsonSchema: 'output',
});

const multiProviderScript = defineScript<
  Record<string, never>,
  Readonly<{ completed: true }>,
  Readonly<{ repository: ScriptResourceHandle<MultiProviderClients> }>
>({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:test/multi-provider',
    version: 1,
    summary: 'Exercises multiple provider modules attached to one resource.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'read',
    permissions: ['test.multi-provider.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    providers: [
      { name: 'alpha', contract: 'revo.provider.test-alpha/v1', resource: 'repository' },
      { name: 'beta', contract: 'revo.provider.test-beta/v1', resource: 'repository' },
    ],
    credentials: [],
    effects: ['git.read', 'filesystem.read'],
    timeout: { wallClockMs: 5_000 },
    retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
    idempotency: 'read-only',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  },
  inputSchema,
  resultSchema,
  implementation: {
    id: '@revisium/revo-scripts/test/multi-provider',
    version: '1.0.0',
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000003',
  },
  handler: {
    execute: async () => ({ value: { completed: true } }),
  },
});

const multiProviderDefinitions = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/test/multi-provider-definitions',
  provenance: {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0-test',
  },
  registerInto: (registrar) => {
    registrar.register(multiProviderScript);
  },
});

interface ProviderFixtureOptions {
  readonly name: 'alpha' | 'beta';
  readonly effect: ScriptEffect;
  readonly clientName: keyof MultiProviderClients;
  readonly failWith?: Error;
  readonly coordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
}

const fixtureProvider = (
  options: ProviderFixtureOptions,
  created: string[],
  disposed: string[],
): ScriptProviderRegistration => ({
  module: {
    id: `provider:test-${options.name}/memory`,
    contract: `revo.provider.test-${options.name}/v1`,
    implementationDigest: `sha256:${(options.name === 'alpha' ? 'a' : 'b').repeat(64)}`,
    provenance: {
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0-test',
    },
    effects: [options.effect],
    workspace: 'none',
    ...(options.coordinateSchema === undefined
      ? {}
      : { coordinateSchema: options.coordinateSchema }),
    createResourceClients: async () => {
      created.push(options.name);

      if (options.failWith !== undefined) {
        throw options.failWith;
      }

      return {
        clients: { [options.clientName]: {} },
        dispose: async () => {
          disposed.push(options.name);
        },
      };
    },
  },
});

const host: RevoScriptsHost = {
  workspaces: {
    resolve: async () => {
      throw new Error('Workspace-free providers must not resolve a workspace.');
    },
  },
  credentials: {
    resolve: async () => {
      throw new Error('The multi-provider fixture does not declare credentials.');
    },
  },
  events: { emit: async () => undefined },
  clock: { now: () => 1_000, sleep: async () => undefined },
};

export interface MultiProviderConsumerFixture {
  readonly created: readonly string[];
  readonly disposed: readonly string[];
  readonly request: RevoScriptExecutionRequest;
  readonly scripts: ReturnType<typeof createRevoScripts>;
}

export interface MultiProviderConsumerOptions {
  readonly alphaClient: keyof MultiProviderClients;
  readonly betaClient: keyof MultiProviderClients;
  readonly betaFailure?: Error;
  readonly alphaCoordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
  readonly providerCoordinates?: Readonly<Record<string, unknown>>;
}

export const createMultiProviderConsumerFixture = (
  options: MultiProviderConsumerOptions,
): MultiProviderConsumerFixture => {
  const created: string[] = [];
  const disposed: string[] = [];
  const scripts = createRevoScripts({
    definitions: [multiProviderDefinitions()],
    providers: [
      fixtureProvider(
        {
          name: 'alpha',
          effect: 'git.read',
          clientName: options.alphaClient,
          ...(options.alphaCoordinateSchema === undefined
            ? {}
            : { coordinateSchema: options.alphaCoordinateSchema }),
        },
        created,
        disposed,
      ),
      fixtureProvider(
        {
          name: 'beta',
          effect: 'filesystem.read',
          clientName: options.betaClient,
          ...(options.betaFailure === undefined ? {} : { failWith: options.betaFailure }),
        },
        created,
        disposed,
      ),
    ],
    host,
  });
  const request: RevoScriptExecutionRequest = {
    executionId: 'multi-provider-consumer',
    script: { id: 'script:test/multi-provider', version: 1 },
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'read',
          grant: {
            permissions: ['test.multi-provider.read'],
            effects: ['git.read', 'filesystem.read'],
          },
          providerCoordinates: options.providerCoordinates ?? {},
        },
      },
      credentials: {},
    },
  };

  return { created, disposed, request, scripts };
};
