import { expect, test } from 'vitest';

import { executeGitHubProviderScenario } from '../../support/github/github-provider-consumer-fixture.js';
import {
  onlyThread,
  reviewThreadResponse,
  respondInput,
  responseProof,
  statefulFetch,
  type ReviewThreadState,
} from '../../support/github/github-review-thread-operation-fixture.js';

test('posts a bounded selected batch in input order and never resolves it', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-operation',
    fetch: statefulFetch(state),
  });

  expect({ result, effects: state }).toEqual({
    result: {
      ok: true,
      value: responseProof('thread-reply-operation'),
      evidence: [],
      attempts: 1,
    },
    effects: {
      resolved: false,
      comments: [
        {
          id: 'reply-1',
          actor: 'revo-bot',
          body: `Addressed.\n\n${onlyThread(responseProof('thread-reply-operation')).marker}`,
        },
      ],
      replyMutations: 1,
      resolveMutations: 0,
    },
  });
});

test('reconciles a reply after a partial crash without a duplicate mutation', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-crash',
    fetch: statefulFetch(state, { failAfterReply: true }),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: true,
      value: {
        ...responseProof('thread-reply-crash'),
        threads: [
          { ...onlyThread(responseProof('thread-reply-crash')), status: 'already-replied' },
        ],
      },
      evidence: [],
      attempts: 2,
    },
    replyMutations: 1,
  });
});

test('blocks foreign or stale review threads before a reply mutation', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([
      { threadId: 'thread-1', decision: 'fix', replyText: 'token=secret-value' },
    ]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-stale',
    fetch: statefulFetch(state, {
      reviewThread: () => reviewThreadResponse(state, { head: 'b'.repeat(40) }),
    }),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The review thread does not belong to the pinned open pull request revision.',
        retryable: false,
      },
      attempts: 1,
    },
    replyMutations: 0,
  });
  expect(JSON.stringify(result)).not.toContain('secret-value');
});

test('blocks a review thread from another repository before a reply mutation', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-foreign',
    fetch: statefulFetch(state, {
      reviewThread: () => reviewThreadResponse(state, { owner: 'attacker' }),
    }),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The review thread does not belong to the bound GitHub repository.',
        retryable: false,
      },
      attempts: 1,
    },
    replyMutations: 0,
  });
});

test('blocks an ambiguous marked reply before another mutation', async () => {
  const proof = responseProof('thread-reply-ambiguous');
  const state: ReviewThreadState = {
    resolved: false,
    comments: [
      { id: 'reply-1', body: `Addressed.\n\n${onlyThread(proof).marker}`, actor: 'attacker' },
      { id: 'reply-2', body: `Addressed.\n\n${onlyThread(proof).marker}`, actor: 'revo-bot' },
    ],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-ambiguous',
    fetch: statefulFetch(state),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'GitHub returned ambiguous or conflicting review-thread reply markers.',
        retryable: false,
      },
      attempts: 1,
    },
    replyMutations: 0,
  });
});

test('blocks a matching marker from a foreign actor before another mutation', async () => {
  const proof = responseProof('thread-reply-foreign-actor');
  const state: ReviewThreadState = {
    resolved: false,
    comments: [
      { id: 'reply-1', body: `Addressed.\n\n${onlyThread(proof).marker}`, actor: 'attacker' },
    ],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-foreign-actor',
    fetch: statefulFetch(state),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'GitHub returned a review-thread reply with an invalid proof identity.',
        retryable: false,
      },
      attempts: 1,
    },
    replyMutations: 0,
  });
});

test('rejects an invalid provider mutation response without exposing a reply body', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/respond',
    input: respondInput([{ threadId: 'thread-1', decision: 'fix', replyText: 'fake-token-123' }]),
    access: 'publish',
    permission: 'github.review-thread.respond',
    idempotencyKey: 'thread-reply-invalid-response',
    fetch: statefulFetch(state, { invalidReplyMutation: true }),
  });

  expect({ result, replyMutations: state.replyMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.invalid_response',
        message: 'GitHub returned an invalid review reply mutation response.',
        retryable: false,
      },
      attempts: 1,
    },
    replyMutations: 1,
  });
  expect(JSON.stringify(result)).not.toContain('fake-token-123');
});
