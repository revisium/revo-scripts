import { expect, test } from 'vitest';

import type { GitHubPullRequestMergeClient } from '../../../src/providers/github/index.js';
import { githubPullRequestMergeScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('merges only the exact pinned head', async () => {
  const merged = {
    ...pullRequest,
    state: 'merged' as const,
    draft: false,
    mergeCommitSha: 'b'.repeat(40),
  };
  const client: GitHubPullRequestMergeClient = {
    merge: async () => ({ ...merged, nodeId: merged.pullRequestId }),
  };
  const harness = createScriptContractHarness(githubPullRequestMergeScript, {
    executionId: 'github-pr-merge',
    idempotencyKey: 'run:pr:merge',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    pullRequest: { ...pullRequest, draft: false },
    method: 'squash',
  });

  expect(execution.result).toEqual({ ok: true, value: merged, evidence: [], attempts: 1 });
});
