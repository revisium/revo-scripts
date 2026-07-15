export interface GitHubReviewThreadRespondRequest {
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly threadId: string;
  readonly body: string;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubReviewThreadRespondSnapshot {
  readonly threadId: string;
  readonly replyId: string;
  readonly resolved: boolean;
}

export interface GitHubReviewThreadRespondClient {
  respond(request: GitHubReviewThreadRespondRequest): Promise<GitHubReviewThreadRespondSnapshot>;
}
