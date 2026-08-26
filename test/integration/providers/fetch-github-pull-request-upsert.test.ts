import { expect, test } from 'vitest';

import { githubManagedPullRequestBody } from '../../../src/providers/github/adapters/fetch/github-operation-marker.js';
import { pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  executeGitHubProviderScenario,
  jsonResponse,
  requestUrl,
} from '../../support/github/github-provider-consumer-fixture.js';
import {
  restPullRequest,
  sourceBranchResponse,
} from '../../support/github/github-pull-request-operation-fixture.js';

test('reconciles an existing exact pull request instead of creating a duplicate', async () => {
  let calls = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Updated title',
      body: 'Updated body.',
      draft: true,
      issueAction: 'none',
    },
    access: 'publish',
    permission: 'github.pull-request.upsert',
    executionId: 'upsert-replay',
    fetch: async (url, init) => {
      calls += 1;
      if (requestUrl(url).endsWith('/graphql')) {
        return jsonResponse(sourceBranchResponse());
      }
      const marker = githubManagedPullRequestBody('Updated body.', {
        operationKey: 'upsert-replay',
        headSha: pullRequest.head.sha,
        title: 'Updated title',
        baseBranch: pullRequest.base.branch,
        draft: true,
      });
      return init?.method === 'PATCH'
        ? jsonResponse(restPullRequest({ body: marker }))
        : jsonResponse([restPullRequest({ body: marker })]);
    },
  });

  expect({ result, calls }).toMatchObject({
    result: { kind: 'succeeded', value: pullRequest, evidence: [] },
    calls: 2,
  });
});

test('refuses a foreign pull request at the exact requested branch identity without a write', async () => {
  let writes = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Updated title',
      body: 'Updated body.',
      draft: true,
      issueAction: 'none',
    },
    access: 'publish',
    permission: 'github.pull-request.upsert',
    executionId: 'upsert-foreign',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        return jsonResponse(sourceBranchResponse());
      }
      if (init?.method !== undefined && init.method !== 'GET') {
        writes += 1;
      }
      return jsonResponse([restPullRequest({ body: 'Human-owned pull request body.' })]);
    },
  });

  expect({ result, writes }).toMatchObject({
    result: {
      kind: 'failed',
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'A foreign pull request already uses the requested head and base.',
        retryable: false,
      },
    },
    writes: 0,
  });
});

test('blocks a stale metadata revision before it can repair a managed pull request', async () => {
  let writes = 0;
  const marker =
    '<!-- revo-managed-pr:v1 -->\n<!-- revo-operation-key:sha256:70ab35ee84e3d0cde713eff4a5d5ff072c8c4814dbeb3115a217783e9d4762d6 -->';
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Changed title',
      body: 'Updated body.',
      draft: true,
      issueAction: 'none',
      expectedPullRequestRevision:
        'github-pr-metadata/v1:sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    },
    access: 'publish',
    permission: 'github.pull-request.upsert',
    executionId: 'upsert-stale',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        return jsonResponse(sourceBranchResponse());
      }
      if (init?.method !== undefined && init.method !== 'GET') {
        writes += 1;
      }
      return jsonResponse([restPullRequest({ body: `Updated body.\n\n${marker}` })]);
    },
  });

  expect({ code: result.kind === 'failed' ? result.error.code : undefined, writes }).toMatchObject({
    code: 'revo.script.idempotency.conflict',
    writes: 0,
  });
});

test('requires post-create readback at the exact head before reporting success', async () => {
  let reads = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Updated title',
      body: 'Updated body.',
      draft: true,
      issueAction: 'none',
    },
    access: 'publish',
    permission: 'github.pull-request.upsert',
    executionId: 'upsert-readback-head-moved',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        return jsonResponse(sourceBranchResponse());
      }
      if (init?.method === 'POST') {
        return jsonResponse(restPullRequest());
      }
      reads += 1;
      if (reads === 1) {
        return jsonResponse([]);
      }
      return jsonResponse(
        restPullRequest({ head: { ref: pullRequest.head.branch, sha: 'b'.repeat(40) } }),
      );
    },
  });

  expect({ code: result.kind === 'failed' ? result.error.code : undefined, reads }).toMatchObject({
    code: 'revo.script.idempotency.conflict',
    reads: 2,
  });
});

test('rejects a moved source branch before creating a pull request', async () => {
  let writes = 0;
  const result = await executeGitHubProviderScenario({
    scriptId: 'script:github/pull-request/upsert',
    input: {
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Updated title',
      body: 'Updated body.',
      draft: true,
      issueAction: 'none',
    },
    access: 'publish',
    permission: 'github.pull-request.upsert',
    executionId: 'upsert-moved-source',
    fetch: async (url, init) => {
      if (requestUrl(url).endsWith('/graphql')) {
        return jsonResponse({
          data: { repository: { ref: { target: { oid: 'b'.repeat(40) } } } },
        });
      }
      if (init?.method !== undefined && init.method !== 'GET') {
        writes += 1;
      }
      return jsonResponse([]);
    },
  });

  expect({ result, writes }).toMatchObject({
    result: {
      kind: 'failed',
      error: {
        code: 'revo.script.idempotency.conflict',
        message: 'The live source branch does not match the pinned pull request head.',
        retryable: false,
      },
    },
    writes: 0,
  });
});
