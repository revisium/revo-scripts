import { defineScript } from '../../../../runtime/definition/define-script.js';
import { GitHubPullRequestMarkReadyHandler } from './github-pull-request-mark-ready.handler.js';
import { githubPullRequestMarkReadyManifest } from './manifest.js';
import {
  githubPullRequestMarkReadyInputSchema,
  githubPullRequestMarkReadyResultSchema,
} from './schemas.js';
import type {
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResources,
  GitHubPullRequestMarkReadyResult,
} from './types.js';

export const githubPullRequestMarkReadyScript = defineScript<
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResult,
  GitHubPullRequestMarkReadyResources
>({
  manifest: githubPullRequestMarkReadyManifest,
  inputSchema: githubPullRequestMarkReadyInputSchema,
  resultSchema: githubPullRequestMarkReadyResultSchema,
  implementation: {
    id: '@revisium/revo-scripts/github/pull-request-mark-ready',
    version: '1.0.0',
  },
  handler: new GitHubPullRequestMarkReadyHandler(),
});
