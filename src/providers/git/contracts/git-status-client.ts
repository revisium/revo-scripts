export type GitChangedPathStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface GitChangedPath {
  readonly path: string;
  readonly status: GitChangedPathStatus;
}

export interface GitStatusSnapshot {
  readonly baseCapture: string;
  readonly headCapture: string;
  readonly changedPaths: readonly GitChangedPath[];
  readonly clean: boolean;
}

export interface GitStatusClient {
  readStatus(signal: AbortSignal): Promise<GitStatusSnapshot>;
}
