export interface GitHubReviewThreadResolveRequest {
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly items: readonly Readonly<{
    threadId: string;
    replyId: string;
    marker: string;
    markerFingerprint: string;
  }>[];
  readonly signal: AbortSignal;
}

export interface GitHubReviewThreadResolveSnapshot {
  readonly threadId: string;
  readonly status: 'resolved' | 'already-resolved';
  readonly replyId: string;
  readonly marker: string;
  readonly markerFingerprint: string;
}

export interface GitHubReviewThreadResolveClient {
  resolveBatch(
    request: GitHubReviewThreadResolveRequest,
  ): Promise<readonly GitHubReviewThreadResolveSnapshot[]>;
}
