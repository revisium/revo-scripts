import type {
  GitHubPullRequestReadinessClient,
  GitHubPullRequestReadinessRequest,
  GitHubPullRequestReadinessSnapshot,
} from '../../../contracts/github-pull-request-readiness-client.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import {
  parseGitHubReadinessBaseBranch,
  parseGitHubReadinessResponse,
} from './github-readiness-response.js';
import { GitHubRequiredCheckIdentityReader } from './github-required-check-identity-reader.js';

const query = `query Readiness($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $number) {
      state isDraft mergeable mergeStateStatus headRefOid baseRef { name branchProtectionRule { requiresStatusChecks requiredStatusCheckContexts } } reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { id isResolved isOutdated comments(first: 1) { nodes { url } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          __typename
          ... on CheckRun { name status conclusion }
          ... on StatusContext { context state }
        }
      } } } } }
    }
  }
}`;

export class FetchGitHubPullRequestReadinessClient implements GitHubPullRequestReadinessClient {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;
  private readonly now: () => Date;
  private readonly requiredCheckIdentity: GitHubRequiredCheckIdentityReader;

  constructor(
    api: GitHubApiClient,
    coordinates: GitHubRepositoryCoordinates,
    now: () => Date = () => new Date(),
  ) {
    this.api = api;
    this.coordinates = coordinates;
    this.now = now;
    this.requiredCheckIdentity = new GitHubRequiredCheckIdentityReader(api, coordinates);
  }

  async readReadiness(
    request: GitHubPullRequestReadinessRequest,
  ): Promise<GitHubPullRequestReadinessSnapshot> {
    const response = await this.api.graphql(
      query,
      {
        owner: this.coordinates.owner,
        repository: this.coordinates.repository,
        number: request.number,
      },
      request.signal,
    );
    const requiredCheckIdentity = await this.requiredCheckIdentity.read(
      parseGitHubReadinessBaseBranch(response),
      request.signal,
    );
    const snapshot = parseGitHubReadinessResponse(
      response,
      this.now().toISOString(),
      requiredCheckIdentity,
    );
    return snapshot;
  }
}
