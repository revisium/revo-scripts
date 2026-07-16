import type { RevoScriptsHost } from '../../../src/host/index.js';
import { createRevoScripts, githubScripts } from '../../../src/index.js';
import { fetchGitHubProviders } from '../../../src/providers/github/index.js';

export interface GitHubProviderScenario {
  readonly scriptId: `script:github/${string}`;
  readonly input: unknown;
  readonly access: 'read' | 'write' | 'publish' | 'admin';
  readonly permission: string;
  readonly fetch: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly idempotencyKey?: string;
}

export const executeGitHubProviderScenario = async (scenario: GitHubProviderScenario) => {
  const host: RevoScriptsHost = {
    workspaces: {
      resolve: async () => {
        throw new Error('GitHub scenarios must not resolve a workspace.');
      },
    },
    credentials: {
      resolve: async (binding) => ({
        alias: binding.alias,
        provider: binding.provider,
        secret: 'github-test-token',
        dispose: async () => undefined,
      }),
    },
    events: { emit: async () => undefined },
  };
  const scripts = createRevoScripts({
    definitions: [githubScripts()],
    providers: fetchGitHubProviders({
      fetch: scenario.fetch,
      ...(scenario.now === undefined ? {} : { now: scenario.now }),
    }),
    host,
  });
  return await scripts.execute({
    executionId: `provider-scenario:${scenario.scriptId}`,
    script: { id: scenario.scriptId, version: 1 },
    input: scenario.input,
    ...(scenario.idempotencyKey === undefined ? {} : { idempotencyKey: scenario.idempotencyKey }),
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: scenario.access,
          grant: {
            permissions: [scenario.permission],
            effects: scenario.access === 'read' ? ['github.read'] : ['github.read', 'github.write'],
          },
          providerCoordinates: {
            github: { owner: 'revisium', repository: 'revo-scripts' },
          },
        },
      },
      credentials: { token: { alias: 'revo-github', provider: 'github' } },
    },
  });
};

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
