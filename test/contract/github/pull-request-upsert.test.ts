import { expect, test } from 'vitest';

import type { GitHubPullRequestUpsertClient } from '../../../src/providers/github/index.js';
import { githubPullRequestUpsertScript } from '../../../src/scripts/github/index.js';
import { createGitHubScriptContractHarness } from '../../support/github/github-contract-fixture.js';
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
  const harness = createGitHubScriptContractHarness(githubPullRequestUpsertScript, {
    executionId: 'github-pr-upsert',
    resources: { repository: githubResource(client, 'publish') },
  });

  const execution = await harness.runAttempt({
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

  expect({ result: execution.result, requests }).toMatchObject({
    result: { kind: 'succeeded', value: pullRequest, evidence: [] },
    requests: [
      {
        head: pullRequest.head,
        base: pullRequest.base,
        title: 'Bounded scripts',
        body: 'Implements exact operations.',
        draft: true,
        operationKey: 'github-pr-upsert',
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
    const harness = createGitHubScriptContractHarness(githubPullRequestUpsertScript, {
      executionId: 'github-pr-upsert-issue-linkage',
      resources: { repository: githubResource(client, 'publish') },
    });

    const execution = await harness.runAttempt({
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

    expect({ result: execution.result.kind, bodies }).toEqual({
      result: 'succeeded',
      bodies: [expectedBody],
    });
  },
);

test('refuses an issue reference for PR issue action none before provider mutation', async () => {
  let calls = 0;
  const harness = createGitHubScriptContractHarness(githubPullRequestUpsertScript, {
    executionId: 'github-pr-upsert-no-issue',
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

  const execution = await harness.runAttempt({
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

  expect({ result: execution.result.kind, calls }).toEqual({ result: 'failed', calls: 0 });
});
