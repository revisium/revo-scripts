export interface GitPushRequest {
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly expectedRemoteHead?: string;
  readonly headCommit: string;
  readonly operationKey: string;
  readonly signal: AbortSignal;
}

export interface GitPushSnapshot {
  readonly status: 'already-published' | 'pushed';
  readonly remoteHead: string;
}

export interface GitPushClient {
  push(request: GitPushRequest): Promise<GitPushSnapshot>;
}
