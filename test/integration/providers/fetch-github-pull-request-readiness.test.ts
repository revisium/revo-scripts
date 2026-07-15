import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
  requestUrl,
} from '../../support/github/github-provider-consumer-fixture.js';

test('maps GraphQL readiness contexts to explicit blockers', async () => {
  const restRequests: string[] = [];
  const fetchStub: typeof globalThis.fetch = async (input, init) => {
    if (init?.method !== 'POST') {
      restRequests.push(requestUrl(input));
      return jsonResponse([]);
    }
    return jsonResponse({
      data: {
        repository: {
          pullRequest: {
            state: 'OPEN',
            isDraft: false,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
            reviewDecision: 'APPROVED',
            headRefOid: pullRequest.head.sha,
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
  };

  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/readiness',
    input: pullRequest,
    access: 'read',
    permission: 'github.pull-request.readiness',
    now: () => new Date('2026-07-14T00:00:00.000Z'),
    fetch: fetchStub,
  });
  expect(result).toMatchObject({
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
      observedAt: '2026-07-14T00:00:00.000Z',
      headCommit: pullRequest.head.sha,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'CLEAN',
      checks: [
        { name: 'sonar', required: false, status: 'pending' },
        { name: 'verify', required: true, status: 'success' },
      ],
      unresolvedThreads: [],
      completeness: { checks: 'complete', requiredChecks: 'complete', threads: 'complete' },
      advisory: ['advisory:sonar:pending'],
      classification: 'clean',
    },
    evidence: [],
    attempts: 1,
  });
  expect(restRequests).toEqual([
    expect.stringContaining('/rules/branches/master?per_page=100') as unknown,
  ]);
});
