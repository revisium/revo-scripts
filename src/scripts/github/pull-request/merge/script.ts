import { defineScript } from '../../../../runtime/definition/define-script.js';
import { GitHubPullRequestMergeHandler } from './github-pull-request-merge.handler.js';
import { githubPullRequestMergeManifest } from './manifest.js';
import {
  githubPullRequestMergeInputSchema,
  githubPullRequestMergeResultSchema,
} from './schemas.js';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResources,
  GitHubPullRequestMergeResult,
} from './types.js';

export const githubPullRequestMergeScript = defineScript<
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestMergeResources
>({
  manifest: githubPullRequestMergeManifest,
  inputSchema: githubPullRequestMergeInputSchema,
  resultSchema: githubPullRequestMergeResultSchema,
  implementation: { id: '@revisium/revo-scripts/github/pull-request-merge', version: '1.0.0' },
  handler: new GitHubPullRequestMergeHandler(),
});
