import { expect, test } from 'vitest';

import type { RevoScriptsHost } from '../../../src/host/index.js';
import { createRevoScripts, githubScripts } from '../../../src/index.js';
import { githubManagedPullRequestBody } from '../../../src/providers/github/adapters/fetch/github-operation-marker.js';
import { fetchGitHubProviders } from '../../../src/providers/github/index.js';
import { requestUrl } from '../../support/github/github-provider-consumer-fixture.js';

const headSha = 'a'.repeat(40);
const pullRequestResponse = {
  number: 42,
  node_id: 'PR_node_42',
  html_url: 'https://github.com/revisium/revo-scripts/pull/42',
  head: { ref: 'revo/task', sha: headSha },
  base: { ref: 'master' },
  state: 'open',
  draft: true,
  merged: false,
  merged_at: null,
  merge_commit_sha: null,
  title: 'Bounded scripts',
  body: 'Exact provider execution.',
};

test('resolves a credential and executes pull-request upsert through the bounded provider', async () => {
  const requests: Readonly<{ url: string; method: string; body?: string }>[] = [];
  const fetchStub: typeof globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    const managedPullRequest = {
      ...pullRequestResponse,
      body: githubManagedPullRequestBody('Exact provider execution.', {
        operationKey: 'github-upsert-operation',
        headSha,
        title: 'Bounded scripts',
        baseBranch: 'master',
        draft: true,
      }),
    };
    if (url === 'https://api.github.com/graphql') {
      return new Response(
        JSON.stringify({ data: { repository: { ref: { target: { oid: headSha } } } } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    const value =
      init?.method === 'POST'
        ? managedPullRequest
        : url.includes('/pulls?')
          ? []
          : managedPullRequest;
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  let credentialDisposals = 0;
  const host: RevoScriptsHost = {
    workspaces: {
      resolve: async () => {
        throw new Error('The GitHub provider must not resolve a workspace.');
      },
    },
    credentials: {
      resolve: async (binding) => ({
        alias: binding.alias,
        provider: binding.provider,
        secret: 'github-token-that-must-not-escape',
        dispose: async () => {
          credentialDisposals += 1;
        },
      }),
    },
    events: { emit: async () => undefined },
  };
  const scripts = createRevoScripts({
    definitions: [githubScripts()],
    providers: fetchGitHubProviders({ fetch: fetchStub }),
    host,
  });
  const plan = scripts.resolveForPlan({
    id: 'script:github/pull-request/upsert',
    version: '1.0.0',
  });

  const result = await scripts.execute({
    executionId: 'github-upsert-consumer',
    script: plan.script,
    providers: plan.providers,
    input: {
      repositoryId: 'repository-123',
      owner: 'revisium',
      repository: 'revo-scripts',
      head: { branch: 'revo/task', sha: headSha },
      base: { branch: 'master' },
      title: 'Bounded scripts',
      body: 'Exact provider execution.',
      draft: true,
      issueAction: 'none',
    },
    idempotencyKey: 'github-upsert-operation',
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'publish',
          grant: {
            permissions: ['github.pull-request.upsert'],
            effects: ['github.read', 'github.write'],
          },
          providerCoordinates: {
            github: { owner: 'revisium', repository: 'revo-scripts' },
          },
        },
      },
      credentials: { token: { alias: 'revo-github', provider: 'github' } },
    },
  });

  expect({ result, requests, credentialDisposals }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'github-pull-request/v1',
        repositoryId: 'repository-123',
        number: 42,
        pullRequestId: 'PR_node_42',
        url: 'https://github.com/revisium/revo-scripts/pull/42',
        head: { branch: 'revo/task', sha: headSha },
        base: { branch: 'master' },
        state: 'open',
        draft: true,
        owner: 'revisium',
        repository: 'revo-scripts',
        providerRevision:
          'github-pr-metadata/v1:sha256:b898f3ceef807331a6e1beebeaa2a0db7cf61b55e21b98a8b948f0b6f0b96f5a',
      },
      evidence: [],
      attempts: 1,
    },
    requests: [
      {
        url: 'https://api.github.com/graphql',
        method: 'POST',
        body: JSON.stringify({
          query:
            'query SourceBranch($owner: String!, $repository: String!, $qualifiedName: String!) {\n  repository(owner: $owner, name: $repository) {\n    ref(qualifiedName: $qualifiedName) { target { ... on Commit { oid } } }\n  }\n}',
          variables: {
            owner: 'revisium',
            repository: 'revo-scripts',
            qualifiedName: 'refs/heads/revo/task',
          },
        }),
      },
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/pulls?state=open&head=revisium%3Arevo%2Ftask&base=master&per_page=2',
        method: 'GET',
      },
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/pulls',
        method: 'POST',
        body: JSON.stringify({
          head: 'revo/task',
          base: 'master',
          title: 'Bounded scripts',
          body: githubManagedPullRequestBody('Exact provider execution.', {
            operationKey: 'github-upsert-operation',
            headSha,
            title: 'Bounded scripts',
            baseBranch: 'master',
            draft: true,
          }),
          draft: true,
        }),
      },
      {
        url: 'https://api.github.com/repos/revisium/revo-scripts/pulls/42',
        method: 'GET',
      },
    ],
    credentialDisposals: 1,
  });
  expect(JSON.stringify(result)).not.toContain('github-token-that-must-not-escape');
});
