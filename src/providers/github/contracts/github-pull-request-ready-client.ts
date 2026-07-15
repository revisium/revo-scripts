import type { GitHubPullRequestSnapshot } from './github-pull-request-snapshot.js';

export interface GitHubPullRequestReadyRequest {
  readonly number: number;
  readonly expectedHeadSha: string;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestReadyClient {
  markReady(request: GitHubPullRequestReadyRequest): Promise<GitHubPullRequestSnapshot>;
}
