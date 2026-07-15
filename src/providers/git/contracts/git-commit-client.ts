export interface GitCommitRequest {
  /** Immutable canonical identity of the remote that owns this change. */
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly expectedParent: string;
  readonly expectedTree: string;
  readonly message: string;
  readonly operationKey: string;
  readonly author: Readonly<{
    readonly name: string;
    readonly email: string;
    readonly timestamp: string;
  }>;
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
