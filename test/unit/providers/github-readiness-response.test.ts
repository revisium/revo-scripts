import { expect, test } from 'vitest';

import { parseGitHubReadinessResponse } from '../../../src/providers/github/adapters/fetch/pull-request/github-readiness-response.js';

const noRulesetChecks = { complete: 'complete' as const, names: [] };

const response = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  data: {
    repository: {
      pullRequest: {
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
        headRefOid: 'a'.repeat(40),
        baseRef: {
          name: 'master',
          branchProtectionRule: {
            requiresStatusChecks: true,
            requiredStatusCheckContexts: ['verify'],
          },
        },
        reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
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
                      {
                        __typename: 'CheckRun',
                        name: 'advisory',
                        status: 'COMPLETED',
                        conclusion: 'FAILURE',
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
        ...overrides,
      },
    },
  },
});

test('uses branch-protection required-check identities rather than treating each rollup context as required', () => {
  const parsed = parseGitHubReadinessResponse(
    response(),
    '2026-07-15T00:00:00.000Z',
    noRulesetChecks,
  );

  expect(parsed).toMatchObject({
    checksComplete: 'complete',
    requiredChecksComplete: 'complete',
    checks: [
      { name: 'advisory', required: false, status: 'failure' },
      { name: 'verify', required: true, status: 'success' },
    ],
  });
});

test('keeps bounded collection evidence and gives equal provider state a deterministic revision', () => {
  const first = parseGitHubReadinessResponse(
    response({
      reviewThreads: { pageInfo: { hasNextPage: true }, nodes: [] },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: { pageInfo: { hasNextPage: true }, nodes: [] },
              },
            },
          },
        ],
      },
    }),
    '2026-07-15T00:00:00.000Z',
    noRulesetChecks,
  );
  const second = parseGitHubReadinessResponse(
    response({
      reviewThreads: { pageInfo: { hasNextPage: true }, nodes: [] },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: { pageInfo: { hasNextPage: true }, nodes: [] },
              },
            },
          },
        ],
      },
    }),
    '2026-07-15T00:01:00.000Z',
    noRulesetChecks,
  );

  expect(first).toMatchObject({ checksComplete: 'truncated', threadsComplete: 'truncated' });
  expect(second.providerRevision).toEqual(first.providerRevision);
});

test('keeps unavailable ruleset required-check identity distinct from no configured checks', () => {
  const parsed = parseGitHubReadinessResponse(
    response({
      baseRef: { name: 'master', branchProtectionRule: null },
    }),
    '2026-07-15T00:00:00.000Z',
    { complete: 'unavailable', names: [] },
  );

  expect(parsed.requiredChecksComplete).toEqual('unavailable');
});

test('uses repository or organization ruleset identity when branch protection has no required checks', () => {
  const parsed = parseGitHubReadinessResponse(
    response({ baseRef: { name: 'master', branchProtectionRule: null } }),
    '2026-07-15T00:00:00.000Z',
    { complete: 'complete', names: ['verify'] },
  );

  expect(parsed.checks).toContainEqual({ name: 'verify', required: true, status: 'success' });
});

test('reports a configured required check that has not appeared in the rollup as pending', () => {
  const parsed = parseGitHubReadinessResponse(
    response({ baseRef: { name: 'master', branchProtectionRule: null } }),
    '2026-07-15T00:00:00.000Z',
    { complete: 'complete', names: ['not-started'] },
  );

  expect(parsed.checks).toEqual([
    { name: 'advisory', required: false, status: 'failure' },
    { name: 'not-started', required: true, status: 'pending' },
    { name: 'verify', required: false, status: 'success' },
  ]);
});

test('keeps a present zero configured required-check set complete', () => {
  const parsed = parseGitHubReadinessResponse(
    response({
      baseRef: { name: 'master', branchProtectionRule: null },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: { pageInfo: { hasNextPage: false }, nodes: [] },
              },
            },
          },
        ],
      },
    }),
    '2026-07-15T00:00:00.000Z',
    noRulesetChecks,
  );

  expect(parsed).toMatchObject({ requiredChecksComplete: 'complete', checks: [] });
});

test('deduplicates required identities and keeps missing checks pending', () => {
  const parsed = parseGitHubReadinessResponse(
    response({
      baseRef: {
        name: 'master',
        branchProtectionRule: {
          requiresStatusChecks: true,
          requiredStatusCheckContexts: ['verify', 'verify'],
        },
      },
    }),
    '2026-07-15T00:00:00.000Z',
    { complete: 'complete', names: ['verify', 'build', 'build'] },
  );

  expect(parsed.checks).toEqual([
    { name: 'advisory', required: false, status: 'failure' },
    { name: 'build', required: true, status: 'pending' },
    { name: 'verify', required: true, status: 'success' },
  ]);
});
