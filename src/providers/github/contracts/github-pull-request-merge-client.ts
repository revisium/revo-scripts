import type { GitHubPullRequestSnapshot } from './github-pull-request-snapshot.js';

export interface GitHubPullRequestMergeRequest {
  readonly number: number;
  readonly expectedHeadSha: string;
  readonly method: 'merge' | 'squash' | 'rebase';
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestMergeClient {
  merge(request: GitHubPullRequestMergeRequest): Promise<GitHubPullRequestSnapshot>;
}
