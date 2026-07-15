import { expect, test } from 'vitest';

import type { GitHubReviewThreadResolveClient } from '../../../src/providers/github/index.js';
import { githubReviewThreadResolveScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  githubReviewThreadMarker,
  githubReviewThreadMarkerFingerprint,
} from '../../support/github/github-review-thread-marker-fixture.js';

test('resolves only the ordered response proofs', async () => {
  const marker = githubReviewThreadMarker({
    operationKey: 'run:thread:respond',
    pullRequestNumber: pullRequest.number,
    headCommit: pullRequest.head.sha,
    threadId: 'thread-1',
    replyBody: 'Addressed.',
  });
  const client: GitHubReviewThreadResolveClient = {
    resolveBatch: async (request) =>
      request.items.map((item) => ({ ...item, status: 'resolved' as const })),
  };
  const harness = createScriptContractHarness(githubReviewThreadResolveScript, {
    executionId: 'github-thread-resolve',
    idempotencyKey: 'run:thread:resolve',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-resolve-input/v1',
    pullRequest,
    responses: {
      schemaVersion: 'github-review-threads-respond-result/v1',
      pullRequest: {
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        number: pullRequest.number,
        headCommit: pullRequest.head.sha,
      },
      threads: [
        {
          threadId: 'thread-1',
          disposition: 'fix',
          status: 'replied',
          replyId: 'reply-1',
          marker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
        },
      ],
    },
  });

  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-review-threads-resolve-result/v1',
      pullRequest: {
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        number: pullRequest.number,
        headCommit: pullRequest.head.sha,
      },
      threads: [
        {
          threadId: 'thread-1',
          status: 'resolved',
          replyId: 'reply-1',
          marker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
        },
      ],
    },
    evidence: [],
    attempts: 1,
  });
});

test('rejects a response proof for another pinned head before any provider call', async () => {
  let calls = 0;
  const client: GitHubReviewThreadResolveClient = {
    resolveBatch: async () => {
      calls += 1;
      return [];
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadResolveScript, {
    executionId: 'github-thread-resolve-stale',
    idempotencyKey: 'run:thread:resolve:stale',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-resolve-input/v1',
    pullRequest,
    responses: {
      schemaVersion: 'github-review-threads-respond-result/v1',
      pullRequest: {
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        number: pullRequest.number,
        headCommit: 'b'.repeat(40),
      },
      threads: [],
    },
  });

  expect({ result: execution.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'Response proofs do not match the pinned pull request revision.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 0,
  });
});
