import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
  requestUrl,
} from '../../support/github/github-provider-consumer-fixture.js';

const restPullRequest = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  number: pullRequest.number,
  node_id: pullRequest.pullRequestId,
  html_url: pullRequest.url,
  head: { ref: pullRequest.head.branch, sha: pullRequest.head.sha },
  base: { ref: pullRequest.base.branch },
  state: 'open',
  draft: pullRequest.draft,
  merged: false,
  merged_at: null,
  merge_commit_sha: null,
  ...overrides,
});

test('marks a pinned draft ready through GraphQL', async () => {
  const fetchStub: typeof globalThis.fetch = async (_input, init) => {
    if (init?.method !== 'POST') {
      return jsonResponse(restPullRequest());
    }
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
    scriptId: 'script:github/pull-request-mark-ready',
    input: { pullRequest },
    access: 'write',
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
    scriptId: 'script:github/pull-request-mark-ready',
    input: { pullRequest: { ...pullRequest, draft: false } },
    access: 'write',
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

test('maps GraphQL readiness contexts to explicit blockers', async () => {
  const fetchStub: typeof globalThis.fetch = async () =>
    jsonResponse({
      data: {
        repository: {
          pullRequest: {
            state: 'OPEN',
            isDraft: false,
            mergeable: 'MERGEABLE',
            reviewDecision: 'APPROVED',
            headRefOid: pullRequest.head.sha,
            commits: {
              nodes: [
                {
                  commit: {
                    statusCheckRollup: {
                      contexts: {
                        pageInfo: { hasNextPage: false },
                        nodes: [
                          {
                            __typename: 'CheckRun',
                            name: 'verify',
                            status: 'COMPLETED',
                            conclusion: 'SUCCESS',
                          },
                          { __typename: 'StatusContext', context: 'sonar', state: 'PENDING' },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request-readiness',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
    },
    access: 'read',
    permission: 'github.pull-request.readiness',
    fetch: fetchStub,
  });

  expect(result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-readiness/v1',
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      headSha: pullRequest.head.sha,
      ready: false,
      blockers: ['check:sonar:pending'],
    },
    evidence: [],
    attempts: 1,
  });
});

test('merges and then confirms the exact pinned pull request head', async () => {
  let reads = 0;
  const mergeCommitSha = 'b'.repeat(40);
  const fetchStub: typeof globalThis.fetch = async (input) => {
    if (requestUrl(input).endsWith('/merge')) {
      return jsonResponse({ merged: true, sha: mergeCommitSha });
    }
    reads += 1;
    return jsonResponse(
      reads === 1
        ? restPullRequest({ draft: false })
        : restPullRequest({
            state: 'closed',
            draft: false,
            merged: true,
            merged_at: '2026-07-14T00:00:00Z',
            merge_commit_sha: mergeCommitSha,
          }),
    );
  };

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request-merge',
    input: { pullRequest: { ...pullRequest, draft: false }, method: 'squash' },
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-operation',
    fetch: fetchStub,
  });

  expect(result).toEqual({
    ok: true,
    value: {
      ...pullRequest,
      draft: false,
      state: 'merged',
      mergeCommitSha,
    },
    evidence: [],
    attempts: 1,
  });
  expect(reads).toEqual(2);
});

test('treats an already-merged exact head as an idempotent success', async () => {
  const mergeCommitSha = 'c'.repeat(40);
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request-merge',
    input: { pullRequest: { ...pullRequest, draft: false }, method: 'merge' },
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-replay',
    fetch: async () => {
      calls += 1;
      return jsonResponse(
        restPullRequest({
          state: 'closed',
          draft: false,
          merged: true,
          merged_at: '2026-07-14T00:00:00Z',
          merge_commit_sha: mergeCommitSha,
        }),
      );
    },
  });

  expect({ result, calls }).toEqual({
    result: {
      ok: true,
      value: {
        ...pullRequest,
        draft: false,
        state: 'merged',
        mergeCommitSha,
      },
      evidence: [],
      attempts: 1,
    },
    calls: 1,
  });
});

test('reconciles an existing exact pull request instead of creating a duplicate', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request-upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Updated title',
      body: 'Updated body.',
      draft: true,
    },
    access: 'write',
    permission: 'github.pull-request.upsert',
    idempotencyKey: 'upsert-replay',
    fetch: async (_input, init) => {
      calls += 1;
      return init?.method === 'PATCH'
        ? jsonResponse(restPullRequest())
        : jsonResponse([restPullRequest()]);
    },
  });

  expect({ result, calls }).toEqual({
    result: { ok: true, value: pullRequest, evidence: [], attempts: 1 },
    calls: 2,
  });
});
