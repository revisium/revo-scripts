import type { GitHubReviewThreadRespondClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { QuestionGateResolutionArtifactV1 } from '../../../approval/contracts/gate-resolution.js';
import type { GitHubPullRequestV1 } from '../../shared/types.js';

export interface GitHubReviewThreadRespondInput {
  readonly schemaVersion: 'github-review-threads-respond-input/v1';
  readonly pullRequest: GitHubPullRequestV1;
  readonly triage: Readonly<{
    items: readonly Readonly<{
      threadId: string;
      decision: 'fix' | 'wontfix' | 'question';
      replyText?: string | undefined;
    }>[];
  }>;
  readonly questionResolution?: QuestionGateResolutionArtifactV1 | undefined;
}
export interface GitHubReviewThreadRespondResult {
  readonly schemaVersion: 'github-review-threads-respond-result/v1';
  readonly pullRequest: Readonly<{
    owner: string;
    repository: string;
    number: number;
    headCommit: string;
  }>;
  readonly threads: readonly Readonly<{
    threadId: string;
    disposition: 'fix' | 'wontfix';
    status: 'replied' | 'already-replied';
    replyId: string;
    marker: string;
    markerFingerprint: string;
  }>[];
}
export type GitHubReviewThreadRespondResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubReviewThreadRespondClient }>>;
}>;
