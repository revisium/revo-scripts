import { expect, test } from 'vitest';

import type { GitHubPullRequestUpsertClient } from '../../../src/providers/github/index.js';
import { githubPullRequestUpsertScript } from '../../../src/scripts/github/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';

test('upserts an exact pull request and returns its pinned identity', async () => {
  const requests: unknown[] = [];
  const client: GitHubPullRequestUpsertClient = {
    upsert: async (request) => {
      requests.push(request);
      return {
        ...pullRequest,
        title: 'Bounded scripts',
        body: 'Implements exact operations.',
        nodeId: pullRequest.pullRequestId,
      };
    },
  };
  const harness = createScriptContractHarness(githubPullRequestUpsertScript, {
    executionId: 'github-pr-upsert',
    idempotencyKey: 'run:pr:upsert',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    owner: pullRequest.owner,
    repository: pullRequest.repository,
    head: pullRequest.head,
    base: pullRequest.base,
    title: 'Bounded scripts',
    body: 'Implements exact operations.',
    draft: true,
    issueAction: 'none',
  });

  expect({ result: execution.result, requests }).toEqual({
    result: { ok: true, value: pullRequest, evidence: [], attempts: 1 },
    requests: [
      {
        head: pullRequest.head,
        base: pullRequest.base,
        title: 'Bounded scripts',
        body: 'Implements exact operations.',
        draft: true,
        operationKey: 'run:pr:upsert',
        marker: {
          headSha: 'a'.repeat(40),
          title: 'Bounded scripts',
          baseBranch: 'master',
          draft: true,
        },
        signal: expect.any(AbortSignal) as unknown,
      },
    ],
  });
});

test.each([
  {
    issueAction: 'close' as const,
    issueRef: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: 352,
      url: 'https://github.com/revisium/revo-scripts/issues/352',
    },
    expectedBody: 'Implements exact operations.\n\nCloses #352',
  },
  {
    issueAction: 'refs' as const,
    issueRef: {
      owner: 'revisium',
      repository: 'orchestrator',
      number: 353,
      url: 'https://github.com/revisium/orchestrator/issues/353',
    },
    expectedBody: 'Implements exact operations.\n\nRefs revisium/orchestrator#353',
  },
])(
  'renders canonical PR issue linkage for $issueAction',
  async ({ issueAction, issueRef, expectedBody }) => {
    const bodies: string[] = [];
    const client: GitHubPullRequestUpsertClient = {
      upsert: async (request) => {
        bodies.push(request.body);
        return {
          ...pullRequest,
          title: request.title,
          body: request.body,
          nodeId: pullRequest.pullRequestId,
        };
      },
    };
    const harness = createScriptContractHarness(githubPullRequestUpsertScript, {
      executionId: 'github-pr-upsert-issue-linkage',
      idempotencyKey: 'run:pr:upsert:issue-linkage',
      resources: { repository: githubResource(client, 'publish') },
    });

    const execution = await harness.execute({
      repositoryId: pullRequest.repositoryId,
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      head: pullRequest.head,
      base: pullRequest.base,
      title: 'Bounded scripts',
      body: 'Implements exact operations.',
      draft: true,
      issueAction,
      issueRef,
    });

    expect({ ok: execution.result.ok, bodies }).toEqual({ ok: true, bodies: [expectedBody] });
  },
);

test('refuses an issue reference for PR issue action none before provider mutation', async () => {
  let calls = 0;
  const harness = createScriptContractHarness(githubPullRequestUpsertScript, {
    executionId: 'github-pr-upsert-no-issue',
    idempotencyKey: 'run:pr:upsert:no-issue',
    resources: {
      repository: githubResource(
        {
          upsert: async () => {
            calls += 1;
            throw new Error('must not run');
          },
        },
        'publish',
      ),
    },
  });

  const execution = await harness.execute({
    repositoryId: pullRequest.repositoryId,
    owner: pullRequest.owner,
    repository: pullRequest.repository,
    head: pullRequest.head,
    base: pullRequest.base,
    title: 'Bounded scripts',
    body: 'Implements exact operations.',
    draft: true,
    issueAction: 'none',
    issueRef: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: 352,
      url: 'https://github.com/revisium/revo-scripts/issues/352',
    },
  });

  expect({ ok: execution.result.ok, calls }).toEqual({ ok: false, calls: 0 });
});
