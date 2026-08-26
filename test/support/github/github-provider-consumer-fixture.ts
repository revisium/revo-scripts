import type { RevoScriptsHost } from '../../../src/host/revo-scripts-host.js';
import type { ScriptAttemptResult } from '../../../src/index.js';
import { createRevoScripts, githubScripts } from '../../../src/index.js';
import { fetchGitHubProviders } from '../../../src/providers/github/index.js';

export interface GitHubProviderScenario {
  readonly scriptId: `script:github/${string}`;
  readonly input: import('../../../src/runtime/spec/json/json-value.js').JsonValue;
  readonly access: 'read' | 'write' | 'publish';
  readonly permission: string;
  readonly fetch: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly executionId?: string;
}

export const executeGitHubProviderScenario = async (
  scenario: GitHubProviderScenario,
): Promise<ScriptAttemptResult> => {
  const executionId = scenario.executionId ?? `provider-scenario:${scenario.scriptId}`;
  const scripts = createRevoScripts({
    definitions: [githubScripts()],
    providers: fetchGitHubProviders({
      fetch: scenario.fetch,
      ...(scenario.now === undefined ? {} : { now: scenario.now }),
    }),
    host: createGitHubProviderHost(),
  });
  const signal = new AbortController().signal;
  const script = { id: scenario.scriptId, version: 1 } as const;
  const binding = await scripts.prepareBinding(
    {
      script,
      resources: { repository: { resourceRef: 'resource:repository' } },
      credentials: { token: 'credential:github' },
    },
    { signal },
  );
  return await scripts.executeAttempt(
    {
      executionId,
      attemptId: `${executionId}:attempt-1`,
      attemptOrdinal: 1,
      script,
      binding,
      input: scenario.input,
    },
    { signal, events: { emit: async () => undefined } },
  );
};

const createGitHubProviderHost = (): RevoScriptsHost => ({
  resources: {
    inspect: async (resourceRef) =>
      resourceRef === 'resource:repository'
        ? {
            resourceId: 'target',
            kind: 'repository',
            repositoryId: 'repository-123',
            grant: {
              permissions: [
                'github.pull-request.upsert',
                'github.pull-request.mark-ready',
                'github.pull-request.readiness',
                'github.review-thread.respond',
                'github.review-thread.resolve',
                'github.pull-request.merge',
              ],
              operations: ['github.read', 'github.write'],
            },
            providerCoordinates: { github: { owner: 'revisium', repository: 'revo-scripts' } },
          }
        : undefined,
  },
  workspaces: {
    inspect: async () => {
      throw new Error('GitHub scenarios must not inspect a workspace.');
    },
    acquire: async () => {
      throw new Error('GitHub scenarios must not acquire a workspace.');
    },
  },
  credentials: {
    inspect: async (alias) =>
      alias === 'credential:github' ? { alias, provider: 'github' } : undefined,
    acquire: async (alias) => {
      if (alias !== 'credential:github') {
        throw new Error('GitHub scenario requested an unexpected credential alias.');
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

export const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const requestUrl = (input: string | URL | Request): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return input instanceof URL ? input.href : input;
};
