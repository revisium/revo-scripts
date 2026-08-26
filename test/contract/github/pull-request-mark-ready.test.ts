import { expect, test } from 'vitest';

import type { GitHubPullRequestReadyClient } from '../../../src/providers/github/index.js';
import { githubPullRequestMarkReadyScript } from '../../../src/scripts/github/index.js';
import { createGitHubScriptContractHarness } from '../../support/github/github-contract-fixture.js';
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
  const harness = createGitHubScriptContractHarness(githubPullRequestMarkReadyScript, {
    executionId: 'github-pr-ready',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.runAttempt({ pullRequest });

  expect(execution.result).toMatchObject({
    kind: 'succeeded',
    value: readyPullRequest,
    evidence: [],
  });
});
