import { expect, test } from 'vitest';

import type { GitHubReviewThreadRespondClient } from '../../../src/providers/github/index.js';
import { githubReviewThreadRespondScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('responds to one review thread and returns a bounded receipt', async () => {
  const client: GitHubReviewThreadRespondClient = {
    respond: async () => ({ threadId: 'thread-1', replyId: 'reply-1', resolved: false }),
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    executionId: 'github-thread-respond',
    idempotencyKey: 'run:thread:respond',
    resources: { repository: githubResource(client) },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    pullRequestNumber: pullRequest.number,
    expectedHeadSha: pullRequest.head.sha,
    threadId: 'thread-1',
    body: 'Addressed in the pinned head.',
  });

  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-review-thread/v1',
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      headSha: pullRequest.head.sha,
      threadId: 'thread-1',
      replyId: 'reply-1',
      resolved: false,
    },
    evidence: [],
    attempts: 1,
  });
});
