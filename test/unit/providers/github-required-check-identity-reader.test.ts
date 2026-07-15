import { expect, test } from 'vitest';

import { GitHubApiClient } from '../../../src/providers/github/adapters/fetch/github-api-client.js';
import { GitHubRequiredCheckIdentityReader } from '../../../src/providers/github/adapters/fetch/pull-request/github-required-check-identity-reader.js';

const reader = (response: Response): GitHubRequiredCheckIdentityReader => {
  const api = new GitHubApiClient({
    token: 'test-token',
    fetch: async () => response,
    apiBaseUrl: 'https://api.github.test',
    graphqlUrl: 'https://api.github.test/graphql',
    userAgent: 'revo-scripts-test',
  });
  return new GitHubRequiredCheckIdentityReader(api, {
    owner: 'revisium',
    repository: 'revo-scripts',
  });
};

test('reads and deduplicates repository and organization ruleset required checks for one branch', async () => {
  const identity = await reader(
    new Response(
      JSON.stringify([
        {
          type: 'required_status_checks',
          parameters: { required_status_checks: [{ context: 'verify' }, { context: 'verify' }] },
        },
        {
          type: 'required_status_checks',
          parameters: { required_status_checks: [{ context: 'build' }, { context: 'verify' }] },
        },
      ]),
      { status: 200 },
    ),
  ).read('master', new AbortController().signal);

  expect(identity).toEqual({ complete: 'complete', names: ['build', 'verify'] });
});

test('reports a malformed required-status-check ruleset identity as unavailable', async () => {
  const identity = await reader(
    new Response(JSON.stringify([{ type: 'required_status_checks', parameters: null }]), {
      status: 200,
    }),
  ).read('master', new AbortController().signal);

  expect(identity).toEqual({ complete: 'unavailable', names: [] });
});

test('reports a paginated applied-ruleset collection as truncated', async () => {
  const identity = await reader(
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { link: '<https://api.github.test/page/2>; rel="next"' },
    }),
  ).read('master', new AbortController().signal);

  expect(identity).toEqual({ complete: 'truncated', names: [] });
});
