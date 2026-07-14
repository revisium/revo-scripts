export interface GitCommitRequest {
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly expectedParent: string;
  readonly expectedTree: string;
  readonly message: string;
  readonly authorship: Readonly<{
    name: string;
    email: string;
    timestamp: string;
  }>;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitCommitSnapshot {
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly commits: readonly string[];
}

export interface GitCommitClient {
  commit(request: GitCommitRequest): Promise<GitCommitSnapshot>;
}
