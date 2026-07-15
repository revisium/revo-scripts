export interface GitHubPullRequestReadinessRequest {
  readonly number: number;
  readonly signal: AbortSignal;
}

export interface GitHubPullRequestReadinessSnapshot {
  readonly headSha: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeable: 'mergeable' | 'conflicting' | 'unknown';
  readonly mergeState: string;
  readonly observedAt: string;
  readonly providerRevision: string;
  readonly checksComplete: 'complete' | 'unavailable' | 'truncated';
  /** Whether GitHub exposed the branch/ruleset required-check identities for this observation. */
  readonly requiredChecksComplete: 'complete' | 'unavailable' | 'truncated';
  readonly threadsComplete: 'complete' | 'truncated';
  readonly checks: readonly Readonly<{
    name: string;
    required: boolean;
    status: 'pending' | 'success' | 'failure';
  }>[];
  readonly threads: readonly Readonly<{
    id: string;
    resolved: boolean;
    outdated: boolean;
    url?: string | undefined;
  }>[];
}

export interface GitHubPullRequestReadinessClient {
  readReadiness(
    request: GitHubPullRequestReadinessRequest,
  ): Promise<GitHubPullRequestReadinessSnapshot>;
}
