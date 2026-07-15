import { expect, test } from 'vitest';

import type {
  GitHubPullRequestMergeClient,
  GitHubPullRequestMergeRequest,
} from '../../../src/providers/github/index.js';
import { githubPullRequestMergeScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

const mergeCommit = 'b'.repeat(40);

const mergeReadback = (status: 'merged' | 'already-merged' = 'merged') => ({
  pullRequest: {
    number: pullRequest.number,
    nodeId: pullRequest.pullRequestId,
    url: pullRequest.url,
    head: pullRequest.head,
    base: pullRequest.base,
    title: 'Bounded scripts',
    body: 'Implements exact operations.',
    providerRevision: pullRequest.providerRevision,
    state: 'merged' as const,
    draft: false,
    mergeable: 'mergeable' as const,
    mergeState: 'CLEAN',
    mergeCommitSha: mergeCommit,
  },
  status,
  sourceBranchDeleted: true as const,
});

const approvalSubject = {
  schemaVersion: 'approval-subject/v1' as const,
  kind: 'publication' as const,
  identity: {
    scheme: 'uri' as const,
    value: `github://${pullRequest.owner}/${pullRequest.repository}/pull/${pullRequest.number}`,
  },
  revision: { scheme: 'git-commit' as const, value: pullRequest.head.sha },
  title: 'Merge the approved pull request',
  summary: 'Merge only the exact approved head.',
  evidence: [],
  risk: 'Publishes the approved change.',
};
const gateSubject = {
  outputNode: 'approval-subject',
  outputOrdinal: 0,
  identity: approvalSubject.identity,
  revision: approvalSubject.revision,
  executionPlanHash: 'sha256:approved-plan',
};

const input = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  pullRequest: { ...pullRequest, draft: false },
  approvalSubject,
  gateResolution: {
    schemaVersion: 'gate-resolution/v1' as const,
    inboxId: 'merge-gate-1',
    resolution: {
      mode: 'subject-approval' as const,
      status: 'active' as const,
      outcome: 'approved' as const,
      decidedAt: '2026-07-14T00:00:00.000Z',
      decidedBy: 'reviewer',
      subject: gateSubject,
    },
  },
  readiness: {
    schemaVersion: 'github-readiness/v1' as const,
    repositoryId: pullRequest.repositoryId,
    pullRequest: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: pullRequest.number,
      url: pullRequest.url,
    },
    observedAt: '2026-07-14T00:01:00.000Z',
    providerRevision: 'github-readiness/v1:example',
    headCommit: pullRequest.head.sha,
    state: 'open' as const,
    draft: false,
    mergeable: 'mergeable' as const,
    mergeState: 'CLEAN',
    checks: [],
    unresolvedThreads: [],
    completeness: {
      checks: 'complete' as const,
      requiredChecks: 'complete' as const,
      threads: 'complete' as const,
    },
    advisory: [],
    classification: 'clean' as const,
  },
  ...overrides,
});

const execute = async (client: GitHubPullRequestMergeClient, value = input()) =>
  await createScriptContractHarness(githubPullRequestMergeScript, {
    executionId: 'github-pr-merge',
    idempotencyKey: 'run:pr:merge',
    resources: { repository: githubResource(client, 'publish') },
  }).execute(value);

test('returns the dedicated exact-head squash merge result', async () => {
  const requests: GitHubPullRequestMergeRequest[] = [];
  const result = await execute(
    {
      merge: async (request) => {
        requests.push(request);
        return mergeReadback();
      },
    },
    input({
      pullRequest: {
        ...pullRequest,
        draft: false,
        issueRef: {
          owner: 'revisium',
          repository: 'orchestrator',
          number: 355,
          action: 'close' as const,
        },
      },
    }),
  );

  expect({
    result: result.result,
    requests: requests.map(({ signal: _signal, ...request }) => request),
  }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'github-pull-request-merge-result/v1',
        repositoryId: 'repository-123',
        owner: 'revisium',
        repository: 'revo-scripts',
        number: 42,
        pullRequestId: 'PR_node_42',
        url: 'https://github.com/revisium/revo-scripts/pull/42',
        approvedHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mergedHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mergeCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        method: 'squash',
        status: 'merged',
        sourceBranchDeleted: true,
        issueRef: { owner: 'revisium', repository: 'orchestrator', number: 355, action: 'close' },
      },
      evidence: [],
      attempts: 1,
    },
    requests: [
      {
        number: 42,
        expectedHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        expectedIssueRef: {
          owner: 'revisium',
          repository: 'orchestrator',
          number: 355,
          action: 'close',
        },
        method: 'squash',
        operationKey: 'run:pr:merge',
      },
    ],
  });
});

test.each([
  [{ owner: 'revisium', repository: 'revo-scripts', number: 355, action: 'close' as const }],
  [{ owner: 'revisium', repository: 'orchestrator', number: 355, action: 'refs' as const }],
  [undefined],
])(
  'passes only the declared close, refs, or no issue linkage to the provider',
  async (issueRef) => {
    const requests: GitHubPullRequestMergeRequest[] = [];
    await execute(
      {
        merge: async (request) => {
          requests.push(request);
          return mergeReadback('already-merged');
        },
      },
      input({
        pullRequest: {
          ...pullRequest,
          draft: false,
          ...(issueRef === undefined ? {} : { issueRef }),
        },
      }),
    );
    expect(requests.map((request) => request.expectedIssueRef)).toEqual([
      issueRef === undefined ? undefined : issueRef,
    ]);
  },
);

test('permits only an exact sorted override audit and returns its bounded identity', async () => {
  let calls = 0;
  const overrideAudit = {
    kind: 'merge-override/v1' as const,
    actor: 'reviewer',
    headCommit: pullRequest.head.sha,
    reason: 'Accepted review debt.',
    risk: 'Known review concerns remain.',
    verificationResponsibility: 'Reviewer owns follow-up verification.',
    threadIds: ['thread-a', 'thread-b'],
  };
  const override = input({
    gateResolution: {
      schemaVersion: 'gate-resolution/v1' as const,
      inboxId: 'merge-gate-1',
      resolution: {
        mode: 'subject-approval' as const,
        status: 'active' as const,
        outcome: 'override_merge' as const,
        decidedAt: '2026-07-14T00:00:00.000Z',
        decidedBy: 'reviewer',
        subject: gateSubject,
        note: 'Accept the bounded review debt.',
        audit: overrideAudit,
      },
    },
    readiness: {
      ...input().readiness,
      unresolvedThreads: [
        { id: 'thread-a', outdated: false },
        { id: 'thread-b', outdated: false },
      ],
      advisory: ['advisory:coverage:failure'],
      classification: 'review_changes' as const,
    },
  });
  const client: GitHubPullRequestMergeClient = {
    merge: async () => {
      calls += 1;
      return mergeReadback();
    },
  };
  const allowed = await execute(client, override);
  const rejected = await execute(
    client,
    input({
      ...override,
      gateResolution: {
        ...override.gateResolution,
        resolution: {
          ...override.gateResolution.resolution,
          audit: {
            ...overrideAudit,
            threadIds: ['thread-b', 'thread-a'],
          },
        },
      },
    }),
  );

  expect({ allowed: allowed.result, rejected: rejected.result, calls }).toEqual({
    allowed: {
      ok: true,
      value: {
        schemaVersion: 'github-pull-request-merge-result/v1',
        repositoryId: 'repository-123',
        owner: 'revisium',
        repository: 'revo-scripts',
        number: 42,
        pullRequestId: 'PR_node_42',
        url: 'https://github.com/revisium/revo-scripts/pull/42',
        approvedHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mergedHeadCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mergeCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        method: 'squash',
        status: 'merged',
        sourceBranchDeleted: true,
        override: {
          actor: 'reviewer',
          auditFingerprint:
            'sha256:db89d4d0a5abfb7f2b2b8a5af4bbf8dc997dff12a7013571a5735321fb73e6f0',
          threadIds: ['thread-a', 'thread-b'],
        },
      },
      evidence: [],
      attempts: 1,
    },
    rejected: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The override audit does not match the actionable unresolved threads.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 1,
  });
});

test.each([
  ['closed', { state: 'closed' as const }],
  ['draft', { draft: true }],
  ['mergeability', { mergeable: 'conflicting' as const }],
  ['merge state', { mergeState: 'BLOCKED' }],
  [
    'incomplete checks',
    {
      completeness: {
        checks: 'unavailable' as const,
        requiredChecks: 'complete' as const,
        threads: 'complete' as const,
      },
    },
  ],
  [
    'unavailable required checks',
    {
      completeness: {
        checks: 'complete' as const,
        requiredChecks: 'unavailable' as const,
        threads: 'complete' as const,
      },
    },
  ],
  ['required check', { checks: [{ name: 'verify', required: true, status: 'failure' }] }],
])('keeps every hard %s blocker non-bypassable', async (_name, readiness) => {
  let calls = 0;
  const result = await execute(
    {
      merge: async () => {
        calls += 1;
        return mergeReadback();
      },
    },
    input({ readiness: { ...input().readiness, ...readiness } }),
  );
  expect({ result: result.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The readiness snapshot contains a non-bypassable merge blocker.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 0,
  });
});

test('compares readiness and gate ordering as instants across timestamp offsets', async () => {
  let calls = 0;
  const result = await execute(
    {
      merge: async () => {
        calls += 1;
        return mergeReadback();
      },
    },
    input({
      gateResolution: {
        ...input().gateResolution,
        resolution: {
          ...input().gateResolution.resolution,
          decidedAt: '2026-07-15T00:30:00-02:00',
        },
      },
      readiness: { ...input().readiness, observedAt: '2026-07-15T01:00:00+02:00' },
    }),
  );

  expect({ result: result.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'Merge approval artifacts do not match the pinned pull request revision.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 0,
  });
});

test('blocks artifact mismatches and invalid provider proof before reporting success', async () => {
  let calls = 0;
  const client: GitHubPullRequestMergeClient = {
    merge: async () => {
      calls += 1;
      return {
        ...mergeReadback(),
        pullRequest: { ...mergeReadback().pullRequest, nodeId: 'PR_node_wrong' },
      };
    },
  };
  const mismatch = await execute(
    client,
    input({
      readiness: { ...input().readiness, observedAt: '2026-07-13T23:59:59.000Z' },
    }),
  );
  const invalidProof = await execute(client);
  expect({ mismatch: mismatch.result, invalidProof: invalidProof.result, calls }).toEqual({
    mismatch: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'Merge approval artifacts do not match the pinned pull request revision.',
        retryable: false,
      },
      attempts: 1,
    },
    invalidProof: {
      ok: false,
      error: {
        code: 'revo.script.provider.invalid_response',
        message: 'GitHub did not prove the merged pull request and source branch state.',
        retryable: false,
      },
      attempts: 1,
    },
    calls: 1,
  });
});
