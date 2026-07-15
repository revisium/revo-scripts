import type { GitHubPullRequestUpsertClient } from '../../../../providers/github/index.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { GitHubPullRequestV1 } from '../../shared/types.js';

export interface GitHubPullRequestUpsertInput {
  readonly repositoryId: string;
  readonly head: Readonly<{ branch: string; sha: string }>;
  readonly base: Readonly<{ branch: string }>;
  readonly title: string;
  readonly body: string;
  readonly draft: boolean;
}

export type GitHubPullRequestUpsertResult = GitHubPullRequestV1;

export type GitHubPullRequestUpsertResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestUpsertClient }>>;
}>;
