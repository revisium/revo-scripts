export interface GitHubReviewThreadResolveRequest {
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly threadId: string;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubReviewThreadResolveSnapshot {
  readonly threadId: string;
  readonly resolved: boolean;
}

export interface GitHubReviewThreadResolveClient {
  resolve(request: GitHubReviewThreadResolveRequest): Promise<GitHubReviewThreadResolveSnapshot>;
}
