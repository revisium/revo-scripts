export interface GitHubReviewThreadRespondRequest {
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly items: readonly Readonly<{
    threadId: string;
    disposition: 'fix' | 'wontfix';
    replyBody: string;
  }>[];
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitHubReviewThreadRespondSnapshot {
  readonly threadId: string;
  readonly disposition: 'fix' | 'wontfix';
  readonly status: 'replied' | 'already-replied';
  readonly replyId: string;
  readonly marker: string;
  readonly markerFingerprint: string;
}

export interface GitHubReviewThreadRespondClient {
  respondBatch(
    request: GitHubReviewThreadRespondRequest,
  ): Promise<readonly GitHubReviewThreadRespondSnapshot[]>;
}
