import type { GitHubPullRequestReadinessClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubReadinessV1 } from '../../shared/types.js';

export interface GitHubPullRequestReadinessInput {
  readonly repositoryId: string;
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
}
export type GitHubPullRequestReadinessResult = GitHubReadinessV1;
export type GitHubPullRequestReadinessResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestReadinessClient }>>;
}>;
