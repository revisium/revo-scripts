import { expect, test } from 'vitest';

import type { GitPushClient } from '../../../src/providers/git/index.js';
import { gitPushScript } from '../../../src/scripts/git/index.js';
import { createGitScriptContractHarness } from '../../support/git/git-fixture.js';

const baseCommit = '0123456789abcdef0123456789abcdef01234567';
const headCommit = 'fedcba9876543210fedcba9876543210fedcba98';

test('publishes only the exact pinned head and returns the same Git change', async () => {
  const requests: unknown[] = [];
  const client: GitPushClient = {
    push: async (request) => {
      requests.push(request);
      return { status: 'pushed', remoteHead: headCommit };
    },
  };
  const harness = createGitScriptContractHarness(gitPushScript, {
    executionId: 'git-push-contract',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'publish',
        grant: {
          permissions: ['git.push.publish'],
          operations: ['git.read', 'git.remote-write'],
        },
        clients: { git: client },
      },
    },
  });
  const change = {
    schemaVersion: 'git-change/v1' as const,
    repositoryId: 'repository-123',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    baseCommit,
    headCommit,
    commits: [headCommit],
  };

  const execution = await harness.runAttempt({ change, expectedRemoteHead: baseCommit });

  expect({ result: execution.result, requests }).toMatchObject({
    result: { kind: 'succeeded', value: change, evidence: [] },
    requests: [
      {
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task-run',
        expectedRemoteHead: baseCommit,
        headCommit,
        operationKey: 'git-push-contract',
        signal: expect.any(AbortSignal) as unknown,
      },
    ],
  });
});
