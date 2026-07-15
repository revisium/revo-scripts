import { githubManagedPullRequestBody } from '../../../src/providers/github/adapters/fetch/github-operation-marker.js';
import { pullRequest } from './github-contract-fixture.js';

export const restPullRequest = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  number: pullRequest.number,
  node_id: pullRequest.pullRequestId,
  html_url: pullRequest.url,
  head: { ref: pullRequest.head.branch, sha: pullRequest.head.sha },
  base: { ref: pullRequest.base.branch },
  state: 'open',
  draft: pullRequest.draft,
  mergeable: 'mergeable',
  mergeable_state: 'CLEAN',
  merged: false,
  merged_at: null,
  merge_commit_sha: null,
  title: 'Updated title',
  body: githubManagedPullRequestBody('Updated body.', {
    operationKey: 'fixture-operation',
    headSha: pullRequest.head.sha,
    title: 'Updated title',
    baseBranch: pullRequest.base.branch,
    draft: pullRequest.draft,
  }),
  ...overrides,
});

export const sourceBranchResponse = (sha: string = pullRequest.head.sha) => ({
  data: { repository: { ref: { target: { oid: sha } } } },
});

export const mergeInput = (
  request: typeof pullRequest & {
    readonly issueRef?: Readonly<{
      owner: string;
      repository: string;
      number: number;
      action: 'close' | 'refs';
    }>;
  },
) => ({
  pullRequest: request,
  approvalSubject: {
    schemaVersion: 'approval-subject/v1' as const,
    kind: 'publication' as const,
    identity: {
      scheme: 'uri' as const,
      value: `github://${request.owner}/${request.repository}/pull/${request.number}`,
    },
    revision: { scheme: 'git-commit' as const, value: request.head.sha },
    title: 'Merge the approved pull request',
    summary: 'Merge only the exact approved head.',
    evidence: [],
    risk: 'Publishes the approved change.',
  },
  gateResolution: {
    schemaVersion: 'gate-resolution/v1' as const,
    inboxId: 'merge-gate-1',
    resolution: {
      mode: 'subject-approval' as const,
      status: 'active' as const,
      outcome: 'approved' as const,
      decidedAt: '2026-07-14T00:00:00.000Z',
      decidedBy: 'reviewer',
      subject: {
        outputNode: 'approval-subject',
        outputOrdinal: 0,
        identity: {
          scheme: 'uri',
          value: `github://${request.owner}/${request.repository}/pull/${request.number}`,
        },
        revision: { scheme: 'git-commit', value: request.head.sha },
        executionPlanHash: 'sha256:approved-plan',
      },
    },
  },
  readiness: {
    schemaVersion: 'github-readiness/v1' as const,
    repositoryId: request.repositoryId,
    pullRequest: {
      owner: request.owner,
      repository: request.repository,
      number: request.number,
      url: request.url,
    },
    observedAt: '2026-07-14T00:01:00.000Z',
    providerRevision: request.providerRevision,
    headCommit: request.head.sha,
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
    advisory: ['checks: none registered'],
    classification: 'clean' as const,
  },
});

export const requestBody = (init: RequestInit | undefined): unknown => {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body.');
  }
  return JSON.parse(init.body);
};

export const graphqlRequest = (
  init: RequestInit | undefined,
): Readonly<{ query: string; variables: unknown }> => {
  const value = requestBody(init);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('query' in value) ||
    !('variables' in value) ||
    typeof value.query !== 'string'
  ) {
    throw new Error('Expected a GraphQL request.');
  }
  return { query: value.query, variables: value.variables };
};
