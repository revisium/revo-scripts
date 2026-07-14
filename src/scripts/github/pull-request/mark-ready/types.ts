import type { GitHubPullRequestReadyClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubPullRequestV1 } from '../../shared/types.js';

export interface GitHubPullRequestMarkReadyInput {
  readonly pullRequest: GitHubPullRequestV1;
}
export type GitHubPullRequestMarkReadyResult = GitHubPullRequestV1;
export type GitHubPullRequestMarkReadyResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestReadyClient }>>;
}>;
