export interface GitHubPullRequestV1 {
  readonly schemaVersion: 'github-pull-request/v1';
  readonly repositoryId: string;
  readonly number: number;
  readonly pullRequestId: string;
  readonly url: string;
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeCommitSha?: string | undefined;
}

export interface GitHubReadinessV1 {
  readonly schemaVersion: 'github-readiness/v1';
  readonly repositoryId: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly ready: boolean;
  readonly blockers: readonly string[];
}

export interface GitHubReviewThreadV1 {
  readonly schemaVersion: 'github-review-thread/v1';
  readonly repositoryId: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly threadId: string;
  readonly replyId?: string | undefined;
  readonly resolved: boolean;
}
