export type GitHubIssueAction = 'close' | 'refs' | 'none';

export interface GitHubIssueRefV1 {
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly action: GitHubIssueAction;
}

/** A closed, provider-readback PR artifact. Host artifact provenance is deliberately absent. */
export interface GitHubPullRequestV1 {
  readonly schemaVersion: 'github-pull-request/v1';
  readonly repositoryId: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly pullRequestId: string;
  readonly url: string;
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly providerRevision: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly issueRef?: GitHubIssueRefV1 | undefined;
  readonly mergeCommitSha?: string | undefined;
}

export interface GitHubReadinessCheckV1 {
  readonly name: string;
  readonly required: boolean;
  readonly status: string;
  readonly conclusion?: string | undefined;
}

export interface GitHubReadinessThreadV1 {
  readonly id: string;
  readonly url?: string | undefined;
  readonly outdated: boolean;
}

export interface GitHubReadinessV1 {
  readonly schemaVersion: 'github-readiness/v1';
  readonly repositoryId: string;
  readonly pullRequest: Readonly<{
    owner: string;
    repository: string;
    number: number;
    url: string;
  }>;
  readonly observedAt: string;
  readonly providerRevision: string;
  readonly headCommit: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly mergeable: 'mergeable' | 'conflicting' | 'unknown';
  readonly mergeState: string;
  readonly checks: readonly GitHubReadinessCheckV1[];
  readonly unresolvedThreads: readonly GitHubReadinessThreadV1[];
  readonly completeness: Readonly<{
    checks: 'complete' | 'unavailable' | 'truncated';
    requiredChecks: 'complete' | 'unavailable' | 'truncated';
    threads: 'complete' | 'truncated';
  }>;
  readonly advisory: readonly string[];
  readonly classification:
    | 'clean'
    | 'recheck'
    | 'ci_changes'
    | 'review_changes'
    | 'closed'
    | 'merged'
    | 'unclassifiable';
}

export type { ApprovalSubjectResult as ApprovalSubjectV1 } from '../../approval/subject/types.js';
