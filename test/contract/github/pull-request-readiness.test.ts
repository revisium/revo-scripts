import { expect, test } from 'vitest';

import type { GitHubPullRequestReadinessClient } from '../../../src/providers/github/index.js';
import { githubPullRequestReadinessScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('returns explicit readiness blockers for the pinned head', async () => {
  const client: GitHubPullRequestReadinessClient = {
    readReadiness: async () => ({
      headSha: pullRequest.head.sha,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      reviewDecision: 'approved',
      checks: [{ name: 'verify', status: 'failure' }],
    }),
  };
  const harness = createScriptContractHarness(githubPullRequestReadinessScript, {
    executionId: 'github-pr-readiness',
    resources: { repository: githubResource(client, 'read') },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    pullRequestNumber: pullRequest.number,
    expectedHeadSha: pullRequest.head.sha,
  });

  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-readiness/v1',
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      headSha: pullRequest.head.sha,
      ready: false,
      blockers: ['check:verify:failure'],
    },
    evidence: [],
    attempts: 1,
  });
});
