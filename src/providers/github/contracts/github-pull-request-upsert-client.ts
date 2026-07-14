import type { GitHubPullRequestSnapshot } from './github-pull-request-snapshot.js';

export interface GitHubPullRequestUpsertRequest {
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly title: string;
  readonly body: string;
  readonly draft: boolean;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestUpsertClient {
  upsert(request: GitHubPullRequestUpsertRequest): Promise<GitHubPullRequestSnapshot>;
}
