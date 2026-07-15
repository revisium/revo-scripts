import type { RevoScriptsHost } from '../../../src/host/index.js';
import { builtInScripts, createRevoScripts, type RevoScripts } from '../../../src/index.js';
import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { fetchGitHubProviders } from '../../../src/providers/github/index.js';
import {
  consumerFlowProcessExecutor,
  type ConsumerFlowGitFixture,
} from './consumer-flow-git-fixture.js';
import type { ConsumerFlowGitHubTransport } from './consumer-flow-github-transport.js';

export const createConsumerFlowComposition = (
  git: ConsumerFlowGitFixture,
  github: ConsumerFlowGitHubTransport,
): RevoScripts => {
  const host: RevoScriptsHost = {
    workspaces: {
      resolve: async (workspaceId) => ({
        workspaceId,
        repositoryId: git.repositoryId,
        absolutePath: git.repository,
      }),
    },
    credentials: {
      resolve: async (binding) => ({
        alias: binding.alias,
        provider: binding.provider,
        secret: 'consumer-flow-github-token',
        dispose: async () => undefined,
      }),
    },
    events: { emit: async () => undefined },
    clock: { now: () => 1_000, sleep: async () => undefined },
  };

  return createRevoScripts({
    definitions: [builtInScripts()],
    providers: [
      ...nodeGitProviders({ processExecutor: consumerFlowProcessExecutor }),
      ...fetchGitHubProviders({
        fetch: github.fetch,
        now: () => new Date('2026-07-15T00:01:00Z'),
      }),
    ],
    host,
  });
};
