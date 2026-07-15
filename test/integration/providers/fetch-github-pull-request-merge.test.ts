import { expect, test } from 'vitest';

import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
  requestUrl,
} from '../../support/github/github-provider-consumer-fixture.js';
import {
  graphqlRequest,
  mergeInput,
  requestBody,
  restPullRequest,
} from '../../support/github/github-pull-request-operation-fixture.js';

test('requests one exact-head squash merge with source deletion and proves its readback', async () => {
  const mergeCommit = 'b'.repeat(40);
  let pullRequestReads = 0;
  let sourceBranchReads = 0;
  const writes: Array<Readonly<{ url: string; method: string; body?: unknown }>> = [];
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/merge',
    input: mergeInput({ ...pullRequest, draft: false }),
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-operation',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        const request = graphqlRequest(init);
        if (request.query.includes('SourceBranch')) {
          sourceBranchReads += 1;
          return jsonResponse({
            data: {
              repository: {
                ref:
                  sourceBranchReads === 1
                    ? { id: 'REF_42', target: { oid: pullRequest.head.sha } }
                    : null,
              },
            },
          });
        }
        throw new Error('Unexpected GraphQL request.');
      }
      if (requestUrl(url).endsWith('/merge')) {
        writes.push({
          url: requestUrl(url),
          method: init?.method ?? 'GET',
          body: requestBody(init),
        });
        return jsonResponse({ merged: true, sha: mergeCommit });
      }
      pullRequestReads += 1;
      return jsonResponse(
        pullRequestReads === 1
          ? restPullRequest({ draft: false })
          : restPullRequest({
              state: 'closed',
              draft: false,
              merged: true,
              merged_at: '2026-07-14T00:00:00Z',
              merge_commit_sha: mergeCommit,
            }),
      );
    },
  });

  expect({ result, pullRequestReads, writes }).toEqual({
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
      },
      evidence: [],
      attempts: 1,
    },
    pullRequestReads: 2,
    writes: [
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/pulls/42/merge',
        method: 'PUT',
        body: {
          sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          merge_method: 'squash',
        },
      },
    ],
  });
});

test('adopts an exact already-merged pull request after a crash without another merge', async () => {
  const mergeCommit = 'c'.repeat(40);
  const graphql: Array<Readonly<{ query: string; variables: unknown }>> = [];
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/merge',
    input: mergeInput({ ...pullRequest, draft: false }),
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-replay',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        graphql.push(graphqlRequest(init));
        return jsonResponse({ data: { repository: { ref: null } } });
      }
      return jsonResponse(
        restPullRequest({
          state: 'closed',
          draft: false,
          merged: true,
          merged_at: '2026-07-14T00:00:00Z',
          merge_commit_sha: mergeCommit,
        }),
      );
    },
  });

  expect({
    result,
    graphql: graphql.map(({ query, variables }) => ({
      containsSourceBranchQuery: query.includes('SourceBranch'),
      variables,
    })),
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
        mergeCommit: 'cccccccccccccccccccccccccccccccccccccccc',
        method: 'squash',
        status: 'already-merged',
        sourceBranchDeleted: true,
      },
      evidence: [],
      attempts: 1,
    },
    graphql: [
      {
        containsSourceBranchQuery: true,
        variables: {
          owner: 'revisium',
          repository: 'revo-scripts',
          qualifiedName: 'refs/heads/revo/task',
        },
      },
    ],
  });
});

test('reconciles an undeleted exact source branch through the bounded provider client', async () => {
  const mergeCommit = 'd'.repeat(40);
  let sourceReads = 0;
  let merged = false;
  const writes: Array<Readonly<{ url: string; method: string; body?: unknown }>> = [];
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/merge',
    input: mergeInput({ ...pullRequest, draft: false }),
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-branch-reconcile',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        const request = graphqlRequest(init);
        if (request.query.includes('SourceBranch')) {
          sourceReads += 1;
          return jsonResponse({
            data: {
              repository: {
                ref:
                  sourceReads < 3 ? { id: 'REF_42', target: { oid: pullRequest.head.sha } } : null,
              },
            },
          });
        }
        throw new Error('Unexpected GraphQL request.');
      }
      if (requestUrl(url).endsWith('/merge')) {
        merged = true;
        writes.push({
          url: requestUrl(url),
          method: init?.method ?? 'GET',
          body: requestBody(init),
        });
        return jsonResponse({ merged: true, sha: mergeCommit });
      }
      if (requestUrl(url).endsWith('/git/refs/heads/revo/task')) {
        writes.push({ url: requestUrl(url), method: init?.method ?? 'GET' });
        return new Response(null, { status: 204 });
      }
      return jsonResponse(
        merged
          ? restPullRequest({
              state: 'closed',
              draft: false,
              merged: true,
              merged_at: '2026-07-14T00:00:00Z',
              merge_commit_sha: mergeCommit,
            })
          : restPullRequest({ draft: false }),
      );
    },
  });

  expect({
    result: result.ok,
    writes,
  }).toEqual({
    result: true,
    writes: [
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/pulls/42/merge',
        method: 'PUT',
        body: {
          sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          merge_method: 'squash',
        },
      },
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/git/refs/heads/revo/task',
        method: 'DELETE',
      },
    ],
  });
});

test('rejects a moved live head or an incorrect exact issue token without a merge mutation', async () => {
  const writes: Array<Readonly<{ url: string; method: string }>> = [];
  const moved = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/merge',
    input: mergeInput({ ...pullRequest, draft: false }),
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-moved-head',
    fetch: async (url, init) => {
      if (init?.method !== undefined && init.method !== 'GET') {
        writes.push({ url: requestUrl(url), method: init.method });
      }
      return jsonResponse(
        restPullRequest({
          head: { ref: pullRequest.head.branch, sha: 'e'.repeat(40) },
          draft: false,
        }),
      );
    },
  });
  const incorrectReference = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/merge',
    input: mergeInput({
      ...pullRequest,
      draft: false,
      issueRef: {
        owner: 'revisium',
        repository: 'orchestrator',
        number: 355,
        action: 'refs' as const,
      },
    }),
    access: 'publish',
    permission: 'github.pull-request.merge',
    idempotencyKey: 'merge-incorrect-reference',
    fetch: async (url, init) => {
      if (init?.method !== undefined && init.method !== 'GET') {
        writes.push({ url: requestUrl(url), method: init.method });
      }
      return jsonResponse(
        restPullRequest({ draft: false, body: 'Implements exact operations.\n\nRefs #355' }),
      );
    },
  });

  expect({
    moved: moved.ok ? undefined : moved.error.code,
    incorrectReference: incorrectReference.ok ? undefined : incorrectReference.error.code,
    writes,
  }).toEqual({
    moved: 'revo.script.idempotency.conflict',
    incorrectReference: 'revo.script.idempotency.conflict',
    writes: [],
  });
});
