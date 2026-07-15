import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitHubPullRequestMergeClient,
  GitHubPullRequestMergeRequest,
} from '../../../contracts/github-pull-request-merge-client.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { GitHubPullRequestReader } from './github-pull-request-reader.js';

export class FetchGitHubPullRequestMergeClient implements GitHubPullRequestMergeClient {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;
  private readonly reader: GitHubPullRequestReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
    this.reader = new GitHubPullRequestReader(api, coordinates);
  }

  async merge(request: GitHubPullRequestMergeRequest): Promise<GitHubPullRequestSnapshot> {
    const current = await this.reader.read(request.number, request.expectedHeadSha, request.signal);
    if (current.state === 'merged') {
      return current;
    }
    if (current.state !== 'open' || current.draft) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request is not open and ready for an exact-head merge.',
      );
    }
    await this.api.rest(
      `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${request.number}/merge`,
      {
        method: 'PUT',
        body: { sha: request.expectedHeadSha, merge_method: request.method },
        signal: request.signal,
      },
    );
    const merged = await this.reader.read(request.number, request.expectedHeadSha, request.signal);
    if (merged.state !== 'merged') {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm the pull request merge.',
      );
    }
    return merged;
  }
}
