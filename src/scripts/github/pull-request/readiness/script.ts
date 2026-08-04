import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubPullRequestReadinessHandler } from './github-pull-request-readiness.handler.js';
import { githubPullRequestReadinessManifest } from './manifest.js';
import {
  githubPullRequestReadinessInputSchema,
  githubPullRequestReadinessResultSchema,
  type GitHubPullRequestReadinessInput,
  type GitHubPullRequestReadinessResources,
  type GitHubPullRequestReadinessResult,
} from './schemas.js';

export const githubPullRequestReadinessScript = defineScript<
  GitHubPullRequestReadinessInput,
  GitHubPullRequestReadinessResult,
  GitHubPullRequestReadinessResources
>({
  manifest: githubPullRequestReadinessManifest,
  inputSchema: githubPullRequestReadinessInputSchema,
  resultSchema: githubPullRequestReadinessResultSchema,
  implementation: builtInImplementation(githubPullRequestReadinessManifest.id, '1.0.0'),
  handler: new GitHubPullRequestReadinessHandler(),
});
