import type { GitHubPullRequestMergeClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { MergeGateResolutionArtifactV1 } from '../../../approval/contracts/gate-resolution.js';
import type {
  ApprovalSubjectV1,
  GitHubPullRequestV1,
  GitHubReadinessV1,
} from '../../shared/types.js';

export interface GitHubPullRequestMergeInput {
  readonly pullRequest: GitHubPullRequestV1;
  readonly approvalSubject: ApprovalSubjectV1;
  readonly gateResolution: MergeGateResolutionArtifactV1;
  readonly readiness: GitHubReadinessV1;
}
export interface GitHubPullRequestMergeResult {
  readonly schemaVersion: 'github-pull-request-merge-result/v1';
  readonly repositoryId: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly pullRequestId: string;
  readonly url: string;
  readonly approvedHeadCommit: string;
  readonly mergedHeadCommit: string;
  readonly mergeCommit?: string | undefined;
  readonly method: 'squash';
  readonly status: 'merged' | 'already-merged';
  readonly sourceBranchDeleted: true;
  readonly issueRef?: GitHubPullRequestV1['issueRef'] | undefined;
  readonly override?:
    | Readonly<{
        actor: string;
        auditFingerprint: string;
        threadIds: readonly string[];
      }>
    | undefined;
}
export type GitHubPullRequestMergeResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestMergeClient }>>;
}>;
