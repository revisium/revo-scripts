import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubPullRequestMarkReadyHandler } from './github-pull-request-mark-ready.handler.js';
import { githubPullRequestMarkReadyManifest } from './manifest.js';
import {
  githubPullRequestMarkReadyInputSchema,
  githubPullRequestMarkReadyResultSchema,
  type GitHubPullRequestMarkReadyInput,
  type GitHubPullRequestMarkReadyResources,
  type GitHubPullRequestMarkReadyResult,
} from './schemas.js';

export const githubPullRequestMarkReadyScript = defineScript<
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResult,
  GitHubPullRequestMarkReadyResources
>({
  manifest: githubPullRequestMarkReadyManifest,
  inputSchema: githubPullRequestMarkReadyInputSchema,
  resultSchema: githubPullRequestMarkReadyResultSchema,
  implementation: builtInImplementation(githubPullRequestMarkReadyManifest.id, '1.0.0'),
  handler: new GitHubPullRequestMarkReadyHandler(),
});
