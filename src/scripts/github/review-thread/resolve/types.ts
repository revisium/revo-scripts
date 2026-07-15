import type { GitHubReviewThreadResolveClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubPullRequestV1 } from '../../shared/types.js';
import type { GitHubReviewThreadRespondResult } from '../respond/types.js';
export interface GitHubReviewThreadResolveInput {
  readonly schemaVersion: 'github-review-threads-resolve-input/v1';
  readonly pullRequest: GitHubPullRequestV1;
  readonly responses: GitHubReviewThreadRespondResult;
}
export interface GitHubReviewThreadResolveResult {
  readonly schemaVersion: 'github-review-threads-resolve-result/v1';
  readonly pullRequest: Readonly<{
    owner: string;
    repository: string;
    number: number;
    headCommit: string;
  }>;
  readonly threads: readonly Readonly<{
    threadId: string;
    status: 'resolved' | 'already-resolved';
    replyId: string;
    marker: string;
    markerFingerprint: string;
  }>[];
}
export type GitHubReviewThreadResolveResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubReviewThreadResolveClient }>>;
}>;
