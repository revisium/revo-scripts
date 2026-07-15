import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import { executeGitHubProviderScenario } from '../../support/github/github-provider-consumer-fixture.js';
import {
  onlyThread,
  responseProof,
  statefulFetch,
  type ReviewThreadState,
} from '../../support/github/github-review-thread-operation-fixture.js';

test('resolves a matching response proof and reconciles a partial resolution crash', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [
      {
        id: 'reply-1',
        actor: 'revo-bot',
        body: `Addressed.\n\n${onlyThread(responseProof('thread-resolve-crash')).marker}`,
      },
    ],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/resolve',
    input: {
      schemaVersion: 'github-review-threads-resolve-input/v1',
      pullRequest,
      responses: responseProof('thread-resolve-crash'),
    },
    access: 'publish',
    permission: 'github.review-thread.resolve',
    idempotencyKey: 'thread-resolve-operation',
    fetch: statefulFetch(state, { failAfterResolve: true }),
  });

  expect({ result, resolveMutations: state.resolveMutations }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'github-review-threads-resolve-result/v1',
        pullRequest: responseProof('thread-resolve-crash').pullRequest,
        threads: [
          {
            threadId: 'thread-1',
            status: 'already-resolved',
            replyId: 'reply-1',
            marker: onlyThread(responseProof('thread-resolve-crash')).marker,
            markerFingerprint: onlyThread(responseProof('thread-resolve-crash')).markerFingerprint,
          },
        ],
      },
      evidence: [],
      attempts: 2,
    },
    resolveMutations: 1,
  });
});

test('blocks a wrong response proof before any resolution mutation', async () => {
  const state: ReviewThreadState = {
    resolved: false,
    comments: [],
    replyMutations: 0,
    resolveMutations: 0,
  };
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/review-threads/resolve',
    input: {
      schemaVersion: 'github-review-threads-resolve-input/v1',
      pullRequest,
      responses: responseProof('wrong-proof'),
    },
    access: 'publish',
    permission: 'github.review-thread.resolve',
    idempotencyKey: 'thread-resolve-wrong-proof',
    fetch: statefulFetch(state),
  });

  expect({ result, resolveMutations: state.resolveMutations }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The selected review thread is missing the matching reply proof.',
        retryable: false,
      },
      attempts: 1,
    },
    resolveMutations: 0,
  });
});
