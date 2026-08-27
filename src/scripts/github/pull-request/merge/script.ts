import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubPullRequestMergeHandler } from './github-pull-request-merge.handler.js';
import { githubPullRequestMergeManifest } from './manifest.js';
import {
  githubPullRequestMergeInputSchema,
  githubPullRequestMergeResultSchema,
  type GitHubPullRequestMergeInput,
  type GitHubPullRequestMergeResources,
  type GitHubPullRequestMergeResult,
} from './schemas.js';

export const githubPullRequestMergeScript = defineScript<
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestMergeResources
>({
  manifest: githubPullRequestMergeManifest,
  inputSchema: githubPullRequestMergeInputSchema,
  resultSchema: githubPullRequestMergeResultSchema,
  implementation: builtInImplementation(githubPullRequestMergeManifest.id, '1.0.0'),
  handler: new GitHubPullRequestMergeHandler(),
});
