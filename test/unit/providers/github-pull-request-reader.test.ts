import { expect, test } from 'vitest';

import { GitHubApiClient } from '../../../src/providers/github/adapters/fetch/github-api-client.js';
import { GitHubPullRequestReader } from '../../../src/providers/github/adapters/fetch/pull-request/github-pull-request-reader.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import { pullRequest } from '../../support/github/github-contract-fixture.js';

const restPullRequest = {
  number: pullRequest.number,
  node_id: pullRequest.pullRequestId,
  html_url: pullRequest.url,
  head: { ref: pullRequest.head.branch, sha: pullRequest.head.sha },
  base: { ref: pullRequest.base.branch },
  title: 'Merge the bounded operation',
  body: 'Implements the operation.\n\nCloses revisium/orchestrator#355',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  mergeable_state: 'CLEAN',
  merged: false,
  merged_at: null,
  merge_commit_sha: null,
};

const reader = (
  nodes: readonly Readonly<{ number: number; repository: Readonly<{ nameWithOwner: string }> }>[],
): GitHubPullRequestReader =>
  new GitHubPullRequestReader(
    new GitHubApiClient({
      token: 'test-token',
      fetch: async (_url, init) =>
        init?.method === 'POST'
          ? Response.json({
              data: {
                repository: {
                  pullRequest: {
                    closingIssuesReferences: {
                      pageInfo: { hasNextPage: false },
                      nodes,
                    },
                  },
                },
              },
            })
          : Response.json(restPullRequest),
      apiBaseUrl: 'https://api.github.test',
      graphqlUrl: 'https://api.github.test/graphql',
      userAgent: 'revo-scripts-test',
    }),
    { owner: pullRequest.owner, repository: pullRequest.repository },
  );

const readClosingIssue = async (
  nodes: readonly Readonly<{ number: number; repository: Readonly<{ nameWithOwner: string }> }>[],
) =>
  await reader(nodes)
    .read(pullRequest.number, pullRequest.head.sha, new AbortController().signal, {
      owner: 'revisium',
      repository: 'orchestrator',
      number: 355,
      action: 'close',
    })
    .then(
      (snapshot) => ({ ok: true as const, number: snapshot.number }),
      (error: unknown) => ({
        ok: false as const,
        code: error instanceof ScriptFault ? error.code : 'unexpected',
      }),
    );

test('does not accept a closing keyword without the exact GitHub closing reference', async () => {
  expect(await readClosingIssue([])).toEqual({
    ok: false,
    code: 'revo.script.idempotency.conflict',
  });
});

test('accepts the exact GitHub closing reference as provider proof', async () => {
  expect(
    await readClosingIssue([
      { number: 355, repository: { nameWithOwner: 'revisium/orchestrator' } },
    ]),
  ).toEqual({ ok: true, number: 42 });
});
