import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitHubPullRequestReadinessClient,
  GitHubPullRequestReadinessRequest,
  GitHubPullRequestReadinessSnapshot,
} from '../../../contracts/github-pull-request-readiness-client.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { parseGitHubReadinessResponse } from './github-readiness-response.js';

const query = `query Readiness($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $number) {
      state isDraft mergeable reviewDecision headRefOid
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

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async readReadiness(
    request: GitHubPullRequestReadinessRequest,
  ): Promise<GitHubPullRequestReadinessSnapshot> {
    const snapshot = parseGitHubReadinessResponse(
      await this.api.graphql(
        query,
        {
          owner: this.coordinates.owner,
          repository: this.coordinates.repository,
          number: request.number,
        },
        request.signal,
      ),
    );
    if (snapshot.headSha !== request.expectedHeadSha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request head no longer matches the pinned revision.',
      );
    }
    return snapshot;
  }
}
