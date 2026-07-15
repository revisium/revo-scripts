import { expect, test } from 'vitest';

import type { GitHubPullRequestUpsertClient } from '../../../src/providers/github/index.js';
import { githubPullRequestUpsertScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('upserts an exact pull request and returns its pinned identity', async () => {
  const requests: unknown[] = [];
  const client: GitHubPullRequestUpsertClient = {
    upsert: async (request) => {
      requests.push(request);
      return { ...pullRequest, nodeId: pullRequest.pullRequestId };
    },
  };
  const harness = createScriptContractHarness(githubPullRequestUpsertScript, {
    executionId: 'github-pr-upsert',
    idempotencyKey: 'run:pr:upsert',
    resources: { repository: githubResource(client) },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    head: pullRequest.head,
    base: pullRequest.base,
    title: 'Bounded scripts',
    body: 'Implements exact operations.',
    draft: true,
  });

  expect({ result: execution.result, requests }).toEqual({
    result: { ok: true, value: pullRequest, evidence: [], attempts: 1 },
    requests: [
      {
        head: pullRequest.head,
        base: pullRequest.base,
        title: 'Bounded scripts',
        body: 'Implements exact operations.',
        draft: true,
        operationKey: 'run:pr:upsert',
        signal: expect.any(AbortSignal) as unknown,
      },
    ],
  });
});
