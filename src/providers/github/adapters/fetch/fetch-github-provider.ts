import type { ProviderClientRequest } from '../../../../host/providers/provider-client-request.js';
import type { ScriptProviderModule } from '../../../../host/providers/script-provider-module.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { GitHubCoordinateSchema } from '../../contracts/github-coordinate-schema.js';
import type { GitHubRepositoryCoordinates } from '../../contracts/github-repository-coordinates.js';
import type { FetchGitHubProviderOptions } from './fetch-github-provider-options.js';
import { GitHubApiClient } from './github-api-client.js';
import { FetchGitHubPullRequestMergeClient } from './pull-request/fetch-github-pull-request-merge-client.js';
import { FetchGitHubPullRequestReadinessClient } from './pull-request/fetch-github-pull-request-readiness-client.js';
import { FetchGitHubPullRequestReadyClient } from './pull-request/fetch-github-pull-request-ready-client.js';
import { FetchGitHubPullRequestUpsertClient } from './pull-request/fetch-github-pull-request-upsert-client.js';
import { FetchGitHubReviewThreadResolveClient } from './review-thread/fetch-github-review-thread-resolve-client.js';
import { FetchGitHubReviewThreadRespondClient } from './review-thread/fetch-github-review-thread-respond-client.js';

type BoundedClientFactory = (
  api: GitHubApiClient,
  coordinates: GitHubRepositoryCoordinates,
  options: FetchGitHubProviderOptions,
) => object;

const boundedClientFactories = {
  'github.pull-request.upsert': ((api, coordinates, _options) =>
    new FetchGitHubPullRequestUpsertClient(api, coordinates)) satisfies BoundedClientFactory,
  'github.pull-request.mark-ready': ((api, coordinates, _options) =>
    new FetchGitHubPullRequestReadyClient(api, coordinates)) satisfies BoundedClientFactory,
  'github.pull-request.readiness': ((api, coordinates, options) =>
    new FetchGitHubPullRequestReadinessClient(
      api,
      coordinates,
      options.now,
    )) satisfies BoundedClientFactory,
  'github.review-thread.respond': ((api, coordinates, _options) =>
    new FetchGitHubReviewThreadRespondClient(api, coordinates)) satisfies BoundedClientFactory,
  'github.review-thread.resolve': ((api, coordinates, _options) =>
    new FetchGitHubReviewThreadResolveClient(api, coordinates)) satisfies BoundedClientFactory,
  'github.pull-request.merge': ((api, coordinates, _options) =>
    new FetchGitHubPullRequestMergeClient(api, coordinates)) satisfies BoundedClientFactory,
} as const;

type SupportedPermission = keyof typeof boundedClientFactories;

const isSupportedPermission = (permission: string): permission is SupportedPermission =>
  Object.hasOwn(boundedClientFactories, permission);

export class FetchGitHubProvider implements ScriptProviderModule {
  readonly id = 'provider:github/fetch';
  readonly contract = 'revo.provider.github/v1';
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance = {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0',
  };
  readonly operations = ['github.read', 'github.write'] as const;
  readonly workspace = 'none';
  readonly coordinateSchema = new GitHubCoordinateSchema();
  private readonly options: FetchGitHubProviderOptions;

  constructor(options: FetchGitHubProviderOptions, implementationDigest: `sha256:${string}`) {
    this.options = options;
    this.implementationDigest = implementationDigest;
  }

  async createResourceClients(request: ProviderClientRequest) {
    const credential = request.credentials.token;
    if (credential === undefined) {
      throw new ScriptFault(
        'revo.script.permission.credential',
        'The GitHub provider requires the declared token credential.',
      );
    }
    const coordinates = await this.coordinateSchema.validate(
      request.binding.providerCoordinates.github,
    );
    if (!coordinates.ok) {
      throw new ScriptFault(
        'revo.script.provider.coordinates_invalid',
        'GitHub provider coordinates are invalid.',
      );
    }
    const api = new GitHubApiClient({
      token: credential.secret,
      fetch: this.options.fetch ?? globalThis.fetch,
      apiBaseUrl: this.options.apiBaseUrl ?? 'https://api.github.com',
      graphqlUrl: this.options.graphqlUrl ?? 'https://api.github.com/graphql',
      userAgent: this.options.userAgent ?? '@revisium/revo-scripts',
    });
    return {
      clients: { github: this.createBoundedClient(request, api, coordinates.value) },
      dispose: async () => undefined,
    };
  }

  private createBoundedClient(
    request: ProviderClientRequest,
    api: GitHubApiClient,
    coordinates: GitHubRepositoryCoordinates,
  ): object {
    const permissions = request.manifest.permissions.filter(isSupportedPermission);
    const permission = permissions.length === 1 ? permissions[0] : undefined;
    if (permission === undefined) {
      throw new ScriptFault(
        'revo.script.provider.capability_unsupported',
        'The GitHub provider does not support the declared permission contract.',
      );
    }
    return boundedClientFactories[permission](api, coordinates, this.options);
  }
}
