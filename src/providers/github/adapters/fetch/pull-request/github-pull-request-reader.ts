import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { parseGitHubPullRequest } from './github-pull-request-response.js';

export class GitHubPullRequestReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async read(
    number: number,
    expectedHeadSha: string,
    signal: AbortSignal,
  ): Promise<GitHubPullRequestSnapshot> {
    const pullRequest = parseGitHubPullRequest(
      await this.api.rest(
        `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${number}`,
        { signal },
      ),
    );
    if (pullRequest.head.sha !== expectedHeadSha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request head no longer matches the pinned revision.',
      );
    }
    return pullRequest;
  }
}
