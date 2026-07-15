export interface GitHubPullRequestSnapshot {
  readonly number: number;
  readonly nodeId: string;
  readonly url: string;
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly title: string;
  readonly body: string;
  readonly providerRevision: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeable?: 'mergeable' | 'conflicting' | 'unknown' | undefined;
  readonly mergeState?: string | undefined;
  readonly mergeCommitSha?: string | undefined;
}
