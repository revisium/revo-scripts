import type { RevoScriptsHost } from '../../../src/host/revo-scripts-host.js';
import { createRevoScripts, githubScripts } from '../../../src/index.js';
import type {
  ScriptAttemptResult,
  ScriptDefinition,
  ScriptEvent,
  ScriptIdentityPin,
} from '../../../src/index.js';
import type { JsonValue } from '../../../src/runtime/spec/json/json-value.js';
import type {
  ScriptResourceHandle,
  ScriptResourceMap,
} from '../../../src/runtime/spec/resources/index.js';

export const pullRequest = {
  schemaVersion: 'github-pull-request/v1' as const,
  repositoryId: 'repository-123',
  owner: 'revisium',
  repository: 'revo-scripts',
  number: 42,
  pullRequestId: 'PR_node_42',
  url: 'https://github.com/revisium/revo-scripts/pull/42',
  head: { branch: 'revo/task', sha: 'a'.repeat(40) },
  base: { branch: 'master' },
  providerRevision:
    'github-pr-metadata/v1:sha256:c34eb0e7ca5e5f3044aec08d85e80e1af8ae9d594dafd5c80820bb8a686e25cd',
  state: 'open' as const,
  draft: true,
};

export const githubResource = <T extends object>(
  github: T,
  access: 'read' | 'write' | 'publish' = 'write',
): ScriptResourceHandle<Readonly<{ github: T }>> => ({
  name: 'repository',
  kind: 'repository',
  access,
  grant: {
    permissions: [
      'github.pull-request.upsert',
      'github.pull-request.mark-ready',
      'github.pull-request.readiness',
      'github.review-thread.respond',
      'github.review-thread.resolve',
      'github.pull-request.merge',
    ],
    operations: access === 'read' ? ['github.read'] : ['github.read', 'github.write'],
  },
  clients: { github },
});

export interface GitHubScriptContractHarness {
  runAttempt(
    input: JsonValue,
  ): Promise<Readonly<{ result: ScriptAttemptResult; events: readonly ScriptEvent[] }>>;
}

export const createGitHubScriptContractHarness = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  options: Readonly<{
    readonly executionId: string;
    readonly resources: Readonly<{
      readonly repository: ScriptResourceHandle<Readonly<{ github: object }>>;
    }>;
  }>,
): GitHubScriptContractHarness => {
  const resource = options.resources.repository;
  const scripts = createRevoScripts({
    definitions: [githubScripts()],
    providers: [
      {
        module: {
          id: 'provider:github/contract-fake',
          contract: 'revo.provider.github/v1',
          implementationDigest:
            'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0' },
          operations: ['github.read', 'github.write'],
          workspace: 'none',
          createResourceClients: async () => ({
            clients: { github: resource.clients.github },
            dispose: async () => undefined,
          }),
        },
      },
    ],
    host: createGitHubHost(resource.grant),
  });

  return {
    runAttempt: async (input: JsonValue) => {
      const script: ScriptIdentityPin = {
        id: definition.manifest.id,
        version: definition.manifest.version,
      };
      const signal = new AbortController().signal;
      const binding = await scripts.prepareBinding(
        {
          script,
          resources: { repository: { resourceRef: 'resource:repository' } },
          credentials: { token: 'credential:github' },
        },
        { signal },
      );
      const events: ScriptEvent[] = [];
      const result = await scripts.executeAttempt(
        {
          executionId: options.executionId,
          attemptId: `${options.executionId}:attempt-1`,
          attemptOrdinal: 1,
          script,
          binding,
          input,
        },
        {
          signal,
          events: {
            emit: async (emission) => {
              events.push(emission.event);
            },
          },
        },
      );
      return { result, events };
    },
  };
};

const createGitHubHost = (
  grant: ScriptResourceHandle<Readonly<{ github: object }>>['grant'],
): RevoScriptsHost => ({
  resources: {
    inspect: async (resourceRef) =>
      resourceRef === 'resource:repository'
        ? {
            resourceId: 'target',
            kind: 'repository',
            repositoryId: 'repository-123',
            providerCoordinates: { github: { owner: 'revisium', repository: 'revo-scripts' } },
            grant,
          }
        : undefined,
  },
  workspaces: {
    inspect: async () => {
      throw new Error('GitHub scripts must not inspect a workspace.');
    },
    acquire: async () => {
      throw new Error('GitHub scripts must not acquire a workspace.');
    },
  },
  credentials: {
    inspect: async (alias) =>
      alias === 'credential:github' ? { alias, provider: 'github' } : undefined,
    acquire: async (alias) => {
      if (alias !== 'credential:github') {
        throw new Error('GitHub script requested an unexpected credential alias.');
      }
      return {
        alias,
        provider: 'github',
        secret: 'github-test-token',
        dispose: async () => undefined,
      };
    },
  },
});
