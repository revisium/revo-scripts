import { expect, test } from 'vitest';

import type { GitHubReviewThreadRespondClient } from '../../../src/providers/github/index.js';
import { githubReviewThreadRespondScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  githubReviewThreadMarker,
  githubReviewThreadMarkerFingerprint,
} from '../../support/github/github-review-thread-marker-fixture.js';

test('responds to a selected batch in triage order and returns only provider proofs', async () => {
  const client: GitHubReviewThreadRespondClient = {
    respondBatch: async (request) =>
      request.items.map((item) => {
        const marker = githubReviewThreadMarker({
          operationKey: request.operationKey,
          pullRequestNumber: request.pullRequestNumber,
          headCommit: request.expectedHeadSha,
          threadId: item.threadId,
          replyBody: item.replyBody,
        });
        return {
          threadId: item.threadId,
          disposition: item.disposition,
          status: 'replied' as const,
          replyId: `reply-${item.threadId}`,
          marker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
        };
      }),
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    executionId: 'github-thread-respond',
    idempotencyKey: 'run:thread:respond',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-respond-input/v1',
    pullRequest,
    triage: {
      items: [
        { threadId: 'thread-fix', decision: 'fix', replyText: 'Addressed in the pinned head.\r\n' },
        { threadId: 'thread-wontfix', decision: 'wontfix' },
      ],
    },
  });

  const fixMarker = githubReviewThreadMarker({
    operationKey: 'run:thread:respond',
    pullRequestNumber: pullRequest.number,
    headCommit: pullRequest.head.sha,
    threadId: 'thread-fix',
    replyBody: 'Addressed in the pinned head.',
  });
  const wontfixMarker = githubReviewThreadMarker({
    operationKey: 'run:thread:respond',
    pullRequestNumber: pullRequest.number,
    headCommit: pullRequest.head.sha,
    threadId: 'thread-wontfix',
    replyBody: "Won't fix.",
  });
  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-review-threads-respond-result/v1',
      pullRequest: {
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        number: pullRequest.number,
        headCommit: pullRequest.head.sha,
      },
      threads: [
        {
          threadId: 'thread-fix',
          disposition: 'fix',
          status: 'replied',
          replyId: 'reply-thread-fix',
          marker: fixMarker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(fixMarker),
        },
        {
          threadId: 'thread-wontfix',
          disposition: 'wontfix',
          status: 'replied',
          replyId: 'reply-thread-wontfix',
          marker: wontfixMarker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(wontfixMarker),
        },
      ],
    },
    evidence: [],
    attempts: 1,
  });
});

test('rejects duplicate selections before any provider call', async () => {
  let calls = 0;
  const client: GitHubReviewThreadRespondClient = {
    respondBatch: async () => {
      calls += 1;
      return [];
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    executionId: 'github-thread-respond-duplicates',
    idempotencyKey: 'run:thread:respond:duplicates',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-respond-input/v1',
    pullRequest,
    triage: {
      items: [
        { threadId: 'thread-1', decision: 'fix' },
        { threadId: 'thread-1', decision: 'wontfix' },
      ],
    },
  });

  expect({ result: execution.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
        details: {
          issues: [
            {
              path: ['triage', 'items', 1, 'threadId'],
              message: 'Review-thread triage items must have unique thread ids.',
            },
          ],
        },
      },
      attempts: 0,
    },
    calls: 0,
  });
});

test('rejects question triage without an active continuation resolution', async () => {
  let calls = 0;
  const client: GitHubReviewThreadRespondClient = {
    respondBatch: async () => {
      calls += 1;
      return [];
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    executionId: 'github-thread-respond-empty',
    idempotencyKey: 'run:thread:respond:empty',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-respond-input/v1',
    pullRequest,
    triage: { items: [{ threadId: 'thread-question', decision: 'question' }] },
  });

  expect({ result: execution.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
        details: {
          issues: [
            {
              path: ['questionResolution'],
              message: 'Question triage requires an active continuation resolution.',
            },
          ],
        },
      },
      attempts: 0,
    },
    calls: 0,
  });
});

test('renders a resolved question from the canonical continuation note', async () => {
  const items: Array<Readonly<{ threadId: string; disposition: string; replyBody: string }>> = [];
  const client: GitHubReviewThreadRespondClient = {
    respondBatch: async (request) => {
      items.push(...request.items);
      return request.items.map((item) => {
        const marker = githubReviewThreadMarker({
          operationKey: request.operationKey,
          pullRequestNumber: request.pullRequestNumber,
          headCommit: request.expectedHeadSha,
          threadId: item.threadId,
          replyBody: item.replyBody,
        });
        return {
          threadId: item.threadId,
          disposition: item.disposition,
          status: 'replied' as const,
          replyId: `reply-${item.threadId}`,
          marker,
          markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
        };
      });
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    executionId: 'github-thread-question-resolution',
    idempotencyKey: 'run:thread:question-resolution',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    schemaVersion: 'github-review-threads-respond-input/v1',
    pullRequest,
    triage: { items: [{ threadId: 'thread-question', decision: 'question' }] },
    questionResolution: {
      schemaVersion: 'gate-resolution/v1',
      inboxId: 'question-gate-1',
      resolution: {
        mode: 'continuation',
        status: 'active',
        outcome: 'fix',
        note: 'Use the bounded provider result.',
        decidedAt: '2026-07-15T00:00:00Z',
        decidedBy: 'reviewer',
      },
    },
  });

  expect({ result: execution.result.ok, items }).toEqual({
    result: true,
    items: [
      {
        threadId: 'thread-question',
        disposition: 'fix',
        replyBody: 'Addressed: Use the bounded provider result.',
      },
    ],
  });
});
