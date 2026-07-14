export interface GitHubPullRequestSnapshot {
  readonly number: number;
  readonly nodeId: string;
  readonly url: string;
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeCommitSha?: string | undefined;
}
