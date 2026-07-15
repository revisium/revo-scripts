import { expect, test } from 'vitest';

import type { GitHubPullRequestReadyClient } from '../../../src/providers/github/index.js';
import { githubPullRequestMarkReadyScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('marks only the pinned pull request revision ready', async () => {
  const readyPullRequest = { ...pullRequest, draft: false };
  const client: GitHubPullRequestReadyClient = {
    markReady: async () => ({
      ...readyPullRequest,
      title: 'Bounded scripts',
      body: 'Implements exact operations.',
      nodeId: readyPullRequest.pullRequestId,
    }),
  };
  const harness = createScriptContractHarness(githubPullRequestMarkReadyScript, {
    executionId: 'github-pr-ready',
    idempotencyKey: 'run:pr:ready',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({ pullRequest });

  expect(execution.result).toEqual({
    ok: true,
    value: readyPullRequest,
    evidence: [],
    attempts: 1,
  });
});
