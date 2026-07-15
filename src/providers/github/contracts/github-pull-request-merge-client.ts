import type { GitHubPullRequestSnapshot } from './github-pull-request-snapshot.js';

export interface GitHubPullRequestMergeIssueRef {
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly action: 'close' | 'refs';
}

export interface GitHubPullRequestMergeRequest {
  readonly number: number;
  readonly expectedHeadSha: string;
  readonly expectedIssueRef?: GitHubPullRequestMergeIssueRef | undefined;
  readonly method: 'squash';
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestMergeSnapshot {
  readonly pullRequest: GitHubPullRequestSnapshot;
  readonly status: 'merged' | 'already-merged';
  readonly sourceBranchDeleted: true;
}

export interface GitHubPullRequestMergeClient {
  merge(request: GitHubPullRequestMergeRequest): Promise<GitHubPullRequestMergeSnapshot>;
}
