import { expect, test } from 'vitest';

import type { GitHubPullRequestReadinessClient } from '../../../src/providers/github/index.js';
import { githubPullRequestReadinessScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('returns explicit readiness blockers for the pinned head', async () => {
  const client: GitHubPullRequestReadinessClient = {
    readReadiness: async () => ({
      headSha: pullRequest.head.sha,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'CLEAN',
      observedAt: '2026-01-01T00:00:00.000Z',
      providerRevision: 'github-readiness/v1:example',
      checksComplete: 'complete',
      requiredChecksComplete: 'complete',
      threadsComplete: 'complete',
      threads: [],
      checks: [{ name: 'verify', required: true, status: 'failure' }],
    }),
  };
  const harness = createScriptContractHarness(githubPullRequestReadinessScript, {
    executionId: 'github-pr-readiness',
    resources: { repository: githubResource(client, 'read') },
  });

  const execution = await harness.execute(pullRequest);

  expect(execution.result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'github-readiness/v1',
      repositoryId: pullRequest.repositoryId,
      pullRequest: {
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        number: pullRequest.number,
        url: pullRequest.url,
      },
      observedAt: '2026-01-01T00:00:00.000Z',
      providerRevision: 'github-readiness/v1:example',
      headCommit: pullRequest.head.sha,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'CLEAN',
      checks: [{ name: 'verify', required: true, status: 'failure' }],
      unresolvedThreads: [],
      completeness: { checks: 'complete', requiredChecks: 'complete', threads: 'complete' },
      advisory: [],
      classification: 'ci_changes',
    },
    evidence: [],
    attempts: 1,
  });
});

test.each([
  {
    name: 'zero registered checks are clean',
    snapshot: { checks: [], checksComplete: 'complete' as const },
    expected: 'clean',
  },
  {
    name: 'unavailable required-check identity waits',
    snapshot: { requiredChecksComplete: 'unavailable' as const },
    expected: 'recheck',
  },
  {
    name: 'required pending check waits',
    snapshot: { checks: [{ name: 'verify', required: true, status: 'pending' as const }] },
    expected: 'recheck',
  },
  {
    name: 'required failed check blocks CI',
    snapshot: { checks: [{ name: 'verify', required: true, status: 'failure' as const }] },
    expected: 'ci_changes',
  },
  {
    name: 'advisory failed check remains clean',
    snapshot: { checks: [{ name: 'sonar', required: false, status: 'failure' as const }] },
    expected: 'clean',
  },
  {
    name: 'closed pull request is terminal',
    snapshot: { state: 'closed' as const },
    expected: 'closed',
  },
  {
    name: 'merged pull request is terminal',
    snapshot: { state: 'merged' as const },
    expected: 'merged',
  },
  {
    name: 'actionable thread takes precedence over failed CI',
    snapshot: {
      checks: [{ name: 'verify', required: true, status: 'failure' as const }],
      threads: [{ id: 'thread-1', resolved: false, outdated: false }],
    },
    expected: 'review_changes',
  },
  {
    name: 'resolved and outdated threads do not block',
    snapshot: {
      threads: [
        { id: 'thread-resolved', resolved: true, outdated: false },
        { id: 'thread-outdated', resolved: false, outdated: true },
      ],
    },
    expected: 'clean',
  },
  {
    name: 'bounded collection truncation is unclassifiable',
    snapshot: { checksComplete: 'truncated' as const },
    expected: 'unclassifiable',
  },
])('$name', async ({ snapshot, expected }) => {
  const client: GitHubPullRequestReadinessClient = {
    readReadiness: async () => ({
      headSha: 'b'.repeat(40),
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'CLEAN',
      observedAt: '2026-01-01T00:00:00.000Z',
      providerRevision: 'github-readiness/v1:sha256:example',
      checksComplete: 'complete',
      requiredChecksComplete: 'complete',
      threadsComplete: 'complete',
      threads: [],
      checks: [],
      ...snapshot,
    }),
  };
  const harness = createScriptContractHarness(githubPullRequestReadinessScript, {
    executionId: `github-pr-readiness:${expected}`,
    resources: { repository: githubResource(client, 'read') },
  });

  const execution = await harness.execute(pullRequest);

  expect(execution.result.ok).toEqual(true);
  if (!execution.result.ok) {
    throw new Error('Expected readiness execution to succeed.');
  }
  expect({
    headCommit: execution.result.value.headCommit,
    classification: execution.result.value.classification,
    evidence: execution.result.evidence,
    attempts: execution.result.attempts,
  }).toEqual({
    headCommit: 'b'.repeat(40),
    classification: expected,
    evidence: [],
    attempts: 1,
  });
});
