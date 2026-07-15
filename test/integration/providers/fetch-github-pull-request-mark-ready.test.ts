import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
} from '../../support/github/github-provider-consumer-fixture.js';
import { restPullRequest } from '../../support/github/github-pull-request-operation-fixture.js';

test('marks a pinned draft ready through GraphQL', async () => {
  let ready = false;
  const fetchStub: typeof globalThis.fetch = async (_input, init) => {
    if (init?.method !== 'POST') {
      return jsonResponse(restPullRequest({ draft: ready ? false : pullRequest.draft }));
    }
    ready = true;
    return jsonResponse({
      data: {
        markPullRequestReadyForReview: {
          pullRequest: {
            number: pullRequest.number,
            id: pullRequest.pullRequestId,
            url: pullRequest.url,
            headRefName: pullRequest.head.branch,
            headRefOid: pullRequest.head.sha,
            baseRefName: pullRequest.base.branch,
            state: 'OPEN',
            isDraft: false,
            merged: false,
            mergeCommit: null,
          },
        },
      },
    });
  };

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/mark-ready',
    input: { pullRequest },
    access: 'publish',
    permission: 'github.pull-request.mark-ready',
    idempotencyKey: 'mark-ready-operation',
    fetch: fetchStub,
  });

  expect(result).toEqual({
    ok: true,
    value: { ...pullRequest, draft: false },
    evidence: [],
    attempts: 1,
  });
});

test('treats an already-ready pull request as an idempotent success', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/mark-ready',
    input: { pullRequest: { ...pullRequest, draft: false } },
    access: 'publish',
    permission: 'github.pull-request.mark-ready',
    idempotencyKey: 'mark-ready-replay',
    fetch: async () => {
      calls += 1;
      return jsonResponse(restPullRequest({ draft: false }));
    },
  });

  expect({ result, calls }).toEqual({
    result: {
      ok: true,
      value: { ...pullRequest, draft: false },
      evidence: [],
      attempts: 1,
    },
    calls: 1,
  });
});

test('rejects a terminal non-draft pull request instead of adopting it as ready', async () => {
  let mutations = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/mark-ready',
    input: { pullRequest: { ...pullRequest, draft: false } },
    access: 'publish',
    permission: 'github.pull-request.mark-ready',
    idempotencyKey: 'mark-ready-terminal',
    fetch: async (_url, init) => {
      if (init?.method === 'POST') {
        mutations += 1;
      }
      return jsonResponse(
        restPullRequest({
          state: 'closed',
          draft: false,
          merged: true,
          merged_at: '2026-07-15T00:00:00Z',
        }),
      );
    },
  });

  expect({ result, mutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The pull request is not open at the pinned revision.',
        retryable: false,
      },
      attempts: 1,
    },
    mutations: 0,
  });
});
