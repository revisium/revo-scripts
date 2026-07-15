import type { GitHubPullRequestMergeClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubPullRequestV1 } from '../../shared/types.js';

export interface GitHubPullRequestMergeInput {
  readonly pullRequest: GitHubPullRequestV1;
  readonly method: 'merge' | 'squash' | 'rebase';
}
export type GitHubPullRequestMergeResult = GitHubPullRequestV1;
export type GitHubPullRequestMergeResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestMergeClient }>>;
}>;
