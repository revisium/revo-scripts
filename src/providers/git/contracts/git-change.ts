export interface GitChangeV1 {
  readonly schemaVersion: 'git-change/v1';
  readonly repositoryId: string;
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly commits: readonly string[];
}
