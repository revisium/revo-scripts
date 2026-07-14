export interface GitStatusCounts {
  readonly stagedCount: number;
  readonly unstagedCount: number;
  readonly untrackedCount: number;
  readonly conflictedCount: number;
}

export type GitStatusSnapshot = Readonly<
  GitStatusCounts &
    (
      | { readonly branch: null; readonly headSha: string; readonly detached: true }
      | { readonly branch: string; readonly headSha: string | null; readonly detached: false }
    )
>;

export interface GitStatusClient {
  readStatus(signal: AbortSignal): Promise<GitStatusSnapshot>;
}
