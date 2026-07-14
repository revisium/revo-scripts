import type { GitHubReviewThreadRespondClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubReviewThreadV1 } from '../../shared/types.js';

export interface GitHubReviewThreadRespondInput {
  readonly repositoryId: string;
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly threadId: string;
  readonly body: string;
}
export type GitHubReviewThreadRespondResult = GitHubReviewThreadV1;
export type GitHubReviewThreadRespondResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubReviewThreadRespondClient }>>;
}>;
