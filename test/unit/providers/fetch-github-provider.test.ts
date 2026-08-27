import { expect, test } from 'vitest';

import type { ProviderClientRequest } from '../../../src/host/providers/provider-client-request.js';
import { FetchGitHubPullRequestMergeClient } from '../../../src/providers/github/adapters/fetch/pull-request/fetch-github-pull-request-merge-client.js';
import { FetchGitHubPullRequestReadinessClient } from '../../../src/providers/github/adapters/fetch/pull-request/fetch-github-pull-request-readiness-client.js';
import { FetchGitHubPullRequestReadyClient } from '../../../src/providers/github/adapters/fetch/pull-request/fetch-github-pull-request-ready-client.js';
import { FetchGitHubPullRequestUpsertClient } from '../../../src/providers/github/adapters/fetch/pull-request/fetch-github-pull-request-upsert-client.js';
import { FetchGitHubReviewThreadResolveClient } from '../../../src/providers/github/adapters/fetch/review-thread/fetch-github-review-thread-resolve-client.js';
import { FetchGitHubReviewThreadRespondClient } from '../../../src/providers/github/adapters/fetch/review-thread/fetch-github-review-thread-respond-client.js';
import { fetchGitHubProviders } from '../../../src/providers/github/index.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../../src/runtime/spec/manifest/index.js';
import { githubPullRequestMarkReadyManifest } from '../../../src/scripts/github/pull-request/mark-ready/manifest.js';
import { githubPullRequestMergeManifest } from '../../../src/scripts/github/pull-request/merge/manifest.js';
import { githubPullRequestReadinessManifest } from '../../../src/scripts/github/pull-request/readiness/manifest.js';
import { githubPullRequestUpsertManifest } from '../../../src/scripts/github/pull-request/upsert/manifest.js';
import { githubReviewThreadResolveManifest } from '../../../src/scripts/github/review-thread/resolve/manifest.js';
import { githubReviewThreadRespondManifest } from '../../../src/scripts/github/review-thread/respond/manifest.js';

const supportedPermissionCases = [
  {
    manifest: githubPullRequestUpsertManifest,
    client: FetchGitHubPullRequestUpsertClient,
  },
  {
    manifest: githubPullRequestMarkReadyManifest,
    client: FetchGitHubPullRequestReadyClient,
  },
  {
    manifest: githubPullRequestReadinessManifest,
    client: FetchGitHubPullRequestReadinessClient,
  },
  {
    manifest: githubReviewThreadRespondManifest,
    client: FetchGitHubReviewThreadRespondClient,
  },
  {
    manifest: githubReviewThreadResolveManifest,
    client: FetchGitHubReviewThreadResolveClient,
  },
  {
    manifest: githubPullRequestMergeManifest,
    client: FetchGitHubPullRequestMergeClient,
  },
] as const;

const requireFirst = <T>(values: readonly T[], description: string): T => {
  const value = values[0];
  if (value === undefined) {
    throw new Error(`Expected ${description}.`);
  }
  return value;
};

const requestFor = (
  sourceManifest: ScriptManifestV1,
  permissions: readonly string[] = sourceManifest.permissions,
): ProviderClientRequest => {
  const manifest = { ...sourceManifest, permissions };
  const provider = requireFirst(manifest.providers, 'a GitHub provider requirement');
  const requirement = requireFirst(manifest.resources, 'a GitHub resource requirement');

  return {
    manifest,
    provider,
    requirement,
    binding: {
      resourceId: 'target',
      kind: 'repository',
      repositoryId: 'repository-123',
      access: requirement.access,
      grant: { permissions, operations: manifest.operations },
      providerCoordinates: {
        github: { owner: 'revisium', repository: 'revo-scripts' },
      },
    },
    credentials: {
      token: {
        alias: 'github-test',
        provider: 'github',
        secret: 'test-token',
        dispose: async () => undefined,
      },
    },
    signal: new AbortController().signal,
  };
};

const captureFault = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
  } catch (error: unknown) {
    if (!(error instanceof ScriptFault)) {
      throw new TypeError('Expected a ScriptFault.', { cause: error });
    }
    return { code: error.code, message: error.message };
  }
  throw new Error('Expected provider preparation to fail.');
};

const createProvider = () => {
  const provider = fetchGitHubProviders()[0]?.module;
  if (provider === undefined) {
    throw new Error('Expected the Fetch GitHub provider.');
  }
  return provider;
};

test.each(supportedPermissionCases)(
  'creates only the bounded client for $manifest.permissions.0',
  async ({ manifest, client }) => {
    const provider = createProvider();

    const prepared = await provider.createResourceClients(requestFor(manifest));

    expect(prepared.clients.github).toBeInstanceOf(client);
  },
);

test('ignores unrelated permissions when exactly one supported permission is declared', async () => {
  const provider = createProvider();

  const prepared = await provider.createResourceClients(
    requestFor(githubPullRequestUpsertManifest, [
      'git.status.read',
      'github.pull-request.upsert',
      'consumer.unrelated',
    ]),
  );

  expect(prepared.clients.github).toBeInstanceOf(FetchGitHubPullRequestUpsertClient);
});

test.each([
  { partition: 'zero', permissions: [] },
  {
    partition: 'multiple supported',
    permissions: ['github.pull-request.upsert', 'github.pull-request.merge'],
  },
  { partition: 'unsupported GitHub', permissions: ['github.pull-request.unknown'] },
  { partition: 'unrelated', permissions: ['git.status.read', 'consumer.unrelated'] },
] as const)(
  'rejects the $partition permission partition with the stable capability fault',
  async ({ permissions }) => {
    const provider = createProvider();

    await expect(
      captureFault(() =>
        provider.createResourceClients(requestFor(githubPullRequestUpsertManifest, permissions)),
      ),
    ).resolves.toEqual({
      code: 'revo.script.provider.capability_unsupported',
      message: 'The GitHub provider does not support the declared permission contract.',
    });
  },
);
