import { createHash } from 'node:crypto';

import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
} from '../../support/github/github-provider-consumer-fixture.js';

const reviewThread = (
  resolved: boolean,
  comments: readonly unknown[] = [],
  hasPreviousPage = false,
  repository = { owner: 'revisium', name: 'revo-scripts' },
) => ({
  data: {
    node: {
      id: 'thread-1',
      isResolved: resolved,
      pullRequest: {
        number: pullRequest.number,
        headRefOid: pullRequest.head.sha,
        repository: { name: repository.name, owner: { login: repository.owner } },
      },
      comments: { pageInfo: { hasPreviousPage }, nodes: comments },
    },
  },
});

test('replies once to a pinned review thread', async () => {
  const fetchStub: typeof globalThis.fetch = async (_input, init) => {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    if (
      typeof body === 'object' &&
      body !== null &&
      'query' in body &&
      typeof body.query === 'string' &&
      body.query.includes('mutation Reply')
    ) {
      const variables =
        'variables' in body && typeof body.variables === 'object' && body.variables !== null
          ? body.variables
          : {};
      const replyBody =
        'body' in variables && typeof variables.body === 'string' ? variables.body : '';
      return jsonResponse({
        data: { addPullRequestReviewThreadReply: { comment: { id: 'reply-1', body: replyBody } } },
      });
    }
    return jsonResponse(reviewThread(false));
  };

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-respond',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'thread-1',
      body: 'Addressed.',
    },
    access: 'write',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-operation',
    fetch: fetchStub,
  });

  expect(result).toEqual({
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

test('reconciles a prior reply using its operation marker', async () => {
  const operationKey = 'thread-reply-replay';
  const marker = `<!-- revo-operation-key:sha256:${createHash('sha256').update(operationKey).digest('hex')} -->`;
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-respond',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'thread-1',
      body: 'Addressed.',
    },
    access: 'write',
    permission: 'github.review-thread.respond',
    idempotencyKey: operationKey,
    fetch: async () => {
      calls += 1;
      return jsonResponse(
        reviewThread(false, [{ id: 'reply-existing', body: `Addressed.\n\n${marker}` }]),
      );
    },
  });

  expect({ result, calls }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'github-review-thread/v1',
        repositoryId: pullRequest.repositoryId,
        pullRequestNumber: pullRequest.number,
        headSha: pullRequest.head.sha,
        threadId: 'thread-1',
        replyId: 'reply-existing',
        resolved: false,
      },
      evidence: [],
      attempts: 1,
    },
    calls: 1,
  });
});

test('refuses to reply when an earlier operation marker could be outside the bounded window', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-respond',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'thread-1',
      body: 'Addressed.',
    },
    access: 'write',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-bounded-window',
    fetch: async () => {
      calls += 1;
      return jsonResponse(reviewThread(false, [], true));
    },
  });

  expect({ result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.collection_unbounded',
        message: 'GitHub review thread comments exceed the reconciliation window.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 1,
  });
});

test('refuses to mutate a review thread outside the bound repository', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-respond',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'foreign-thread',
      body: 'Addressed.',
    },
    access: 'write',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'foreign-thread-reply',
    fetch: async () => {
      calls += 1;
      return jsonResponse(
        reviewThread(false, [], false, { owner: 'attacker', name: 'foreign-repository' }),
      );
    },
  });

  expect({ result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The review thread does not belong to the bound GitHub repository.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 1,
  });
});

test('resolves a pinned review thread and confirms the mutation result', async () => {
  let calls = 0;
  const fetchStub: typeof globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? jsonResponse(reviewThread(false))
      : jsonResponse({
          data: { resolveReviewThread: { thread: { id: 'thread-1', isResolved: true } } },
        });
  };

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-resolve',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'thread-1',
    },
    access: 'write',
    permission: 'github.review-thread.resolve',
    idempotencyKey: 'thread-resolve-operation',
    fetch: fetchStub,
  });

  expect(result).toEqual({
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
  expect(calls).toEqual(2);
});

test('treats an already-resolved thread as an idempotent success', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-thread-resolve',
    input: {
      repositoryId: pullRequest.repositoryId,
      pullRequestNumber: pullRequest.number,
      expectedHeadSha: pullRequest.head.sha,
      threadId: 'thread-1',
    },
    access: 'write',
    permission: 'github.review-thread.resolve',
    idempotencyKey: 'thread-resolve-replay',
    fetch: async () => {
      calls += 1;
      return jsonResponse(reviewThread(true));
    },
  });

  expect({ result, calls }).toEqual({
    result: {
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
    },
    calls: 1,
  });
});
