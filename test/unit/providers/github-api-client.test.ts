import { expect, test } from 'vitest';

import { GitHubApiClient } from '../../../src/providers/github/adapters/fetch/github-api-client.js';
import { captureProviderFault } from '../../support/git/git-provider-fixture.js';

const client = (fetch: typeof globalThis.fetch): GitHubApiClient =>
  new GitHubApiClient({
    token: 'secret',
    fetch,
    apiBaseUrl: 'https://api.github.test',
    graphqlUrl: 'https://api.github.test/graphql',
    userAgent: 'revo-scripts-test',
  });

test('maps transport, credential, server, and JSON failures to stable faults', async () => {
  const signal = new AbortController().signal;

  expect({
    transport: await captureProviderFault(() =>
      client(async () => {
        throw new Error('network detail');
      }).rest('/resource', { signal }),
    ),
    credential: await captureProviderFault(() =>
      client(async () => new Response('{}', { status: 401 })).rest('/resource', { signal }),
    ),
    server: await captureProviderFault(() =>
      client(async () => new Response('{}', { status: 503 })).rest('/resource', { signal }),
    ),
    rateLimit: await captureProviderFault(() =>
      client(
        async () =>
          new Response('{}', {
            status: 403,
            headers: { 'retry-after': '1', 'x-ratelimit-remaining': '0' },
          }),
      ).rest('/resource', { signal }),
    ),
    json: await captureProviderFault(() =>
      client(async () => new Response('not-json', { status: 200 })).rest('/resource', { signal }),
    ),
  }).toEqual({
    transport: {
      name: 'ScriptFault',
      code: 'revo.script.provider.transient',
      message: 'GitHub request failed.',
      retryable: true,
    },
    credential: {
      name: 'ScriptFault',
      code: 'revo.script.permission.provider',
      message: 'GitHub rejected the bound credential.',
      retryable: false,
    },
    server: {
      name: 'ScriptFault',
      code: 'revo.script.provider.transient',
      message: 'GitHub rejected the operation.',
      retryable: true,
    },
    rateLimit: {
      name: 'ScriptFault',
      code: 'revo.script.provider.transient',
      message: 'GitHub rate-limited the operation.',
      retryable: true,
    },
    json: {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'GitHub returned an invalid JSON response.',
      retryable: false,
    },
  });
});

test('rejects a successful HTTP response that carries GraphQL errors', async () => {
  const api = client(
    async () =>
      new Response(JSON.stringify({ errors: [{ message: 'provider detail' }] }), { status: 200 }),
  );

  expect(
    await captureProviderFault(() =>
      api.graphql('query Test { viewer { login } }', {}, new AbortController().signal),
    ),
  ).toEqual({
    name: 'ScriptFault',
    code: 'revo.script.provider.request_failed',
    message: 'GitHub GraphQL returned an operation error.',
    retryable: false,
  });
});
