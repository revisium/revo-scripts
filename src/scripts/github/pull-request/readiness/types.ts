import type { GitHubPullRequestReadinessClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubPullRequestV1, GitHubReadinessV1 } from '../../shared/types.js';

export type GitHubPullRequestReadinessInput = GitHubPullRequestV1;
export type GitHubPullRequestReadinessResult = GitHubReadinessV1;
export type GitHubPullRequestReadinessResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestReadinessClient }>>;
}>;
