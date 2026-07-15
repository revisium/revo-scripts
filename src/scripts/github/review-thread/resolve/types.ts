import type { GitHubReviewThreadResolveClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubReviewThreadV1 } from '../../shared/types.js';

export interface GitHubReviewThreadResolveInput {
  readonly repositoryId: string;
  readonly pullRequestNumber: number;
  readonly expectedHeadSha: string;
  readonly threadId: string;
}
export type GitHubReviewThreadResolveResult = GitHubReviewThreadV1;
export type GitHubReviewThreadResolveResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubReviewThreadResolveClient }>>;
}>;
