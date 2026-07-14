export interface GitHubPullRequestReadinessRequest {
  readonly number: number;
  readonly expectedHeadSha: string;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestReadinessSnapshot {
  readonly headSha: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeable: 'mergeable' | 'conflicting' | 'unknown';
  readonly reviewDecision: 'approved' | 'changes-requested' | 'review-required' | 'unknown';
  readonly checks: readonly Readonly<{
    name: string;
    status: 'pending' | 'success' | 'failure';
  }>[];
}

export interface GitHubPullRequestReadinessClient {
  readReadiness(
    request: GitHubPullRequestReadinessRequest,
  ): Promise<GitHubPullRequestReadinessSnapshot>;
}
