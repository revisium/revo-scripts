import { expect, test } from 'vitest';

import type { GitHubReviewThreadResolveClient } from '../../../src/providers/github/index.js';
import { githubReviewThreadResolveScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('resolves one review thread and returns a bounded receipt', async () => {
  const client: GitHubReviewThreadResolveClient = {
    resolve: async () => ({ threadId: 'thread-1', resolved: true }),
  };
  const harness = createScriptContractHarness(githubReviewThreadResolveScript, {
    executionId: 'github-thread-resolve',
    idempotencyKey: 'run:thread:resolve',
    resources: { repository: githubResource(client) },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    pullRequestNumber: pullRequest.number,
    expectedHeadSha: pullRequest.head.sha,
    threadId: 'thread-1',
  });

  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-review-thread/v1',
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      headSha: pullRequest.head.sha,
      threadId: 'thread-1',
      resolved: true,
    },
    evidence: [],
    attempts: 1,
  });
});
