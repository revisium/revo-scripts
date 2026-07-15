import type { ProviderClientRequest } from '../../../../host/providers/provider-client-request.js';
import type { ScriptProviderModule } from '../../../../host/providers/script-provider-module.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { GitHubCoordinateSchema } from '../../contracts/github-coordinate-schema.js';
import type { FetchGitHubProviderOptions } from './fetch-github-provider-options.js';

const supportedPermissions = new Set([
  'github.pull-request.upsert',
  'github.pull-request.mark-ready',
  'github.pull-request.readiness',
  'github.review-thread.respond',
  'github.review-thread.resolve',
  'github.pull-request.merge',
]);
import { GitHubApiClient } from './github-api-client.js';
import { FetchGitHubPullRequestMergeClient } from './pull-request/fetch-github-pull-request-merge-client.js';
import { FetchGitHubPullRequestReadinessClient } from './pull-request/fetch-github-pull-request-readiness-client.js';
import { FetchGitHubPullRequestReadyClient } from './pull-request/fetch-github-pull-request-ready-client.js';
import { FetchGitHubPullRequestUpsertClient } from './pull-request/fetch-github-pull-request-upsert-client.js';
import { FetchGitHubReviewThreadResolveClient } from './review-thread/fetch-github-review-thread-resolve-client.js';
import { FetchGitHubReviewThreadRespondClient } from './review-thread/fetch-github-review-thread-respond-client.js';

export class FetchGitHubProvider implements ScriptProviderModule {
  readonly id = 'provider:github/fetch';
  readonly contract = 'revo.provider.github/v1';
  readonly implementationDigest =
    'sha256:362bbb9bc17f430560321fe99e1cc479040aa74471fb10d88b5206b832f44b45';
  readonly provenance = {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0',
  };
  readonly effects = ['github.read', 'github.write'] as const;
  readonly workspace = 'none';
  readonly coordinateSchema = new GitHubCoordinateSchema();
  private readonly options: FetchGitHubProviderOptions;

  constructor(options: FetchGitHubProviderOptions = {}) {
    this.options = options;
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
    coordinates: Readonly<{ owner: string; repository: string }>,
  ): object {
    const permissions = request.manifest.permissions.filter((permission) =>
      supportedPermissions.has(permission),
    );
    const permission = permissions.length === 1 ? permissions[0] : undefined;
    switch (permission) {
      case 'github.pull-request.upsert':
        return new FetchGitHubPullRequestUpsertClient(api, coordinates);
      case 'github.pull-request.mark-ready':
        return new FetchGitHubPullRequestReadyClient(api, coordinates);
      case 'github.pull-request.readiness':
        return new FetchGitHubPullRequestReadinessClient(api, coordinates, this.options.now);
      case 'github.review-thread.respond':
        return new FetchGitHubReviewThreadRespondClient(api, coordinates);
      case 'github.review-thread.resolve':
        return new FetchGitHubReviewThreadResolveClient(api, coordinates);
      case 'github.pull-request.merge':
        return new FetchGitHubPullRequestMergeClient(api, coordinates);
      case undefined:
      default:
        throw new ScriptFault(
          'revo.script.provider.capability_unsupported',
          'The GitHub provider does not support the declared permission contract.',
        );
    }
  }
}
