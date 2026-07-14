import { defineScript } from '../../../../runtime/definition/define-script.js';
import { GitHubPullRequestUpsertHandler } from './github-pull-request-upsert.handler.js';
import { githubPullRequestUpsertManifest } from './manifest.js';
import {
  githubPullRequestUpsertInputSchema,
  githubPullRequestUpsertResultSchema,
} from './schemas.js';
import type {
  GitHubPullRequestUpsertInput,
  GitHubPullRequestUpsertResources,
  GitHubPullRequestUpsertResult,
} from './types.js';

export const githubPullRequestUpsertScript = defineScript<
  GitHubPullRequestUpsertInput,
  GitHubPullRequestUpsertResult,
  GitHubPullRequestUpsertResources
>({
  manifest: githubPullRequestUpsertManifest,
  inputSchema: githubPullRequestUpsertInputSchema,
  resultSchema: githubPullRequestUpsertResultSchema,
  implementation: { id: '@revisium/revo-scripts/github/pull-request-upsert', version: '1.0.0' },
  handler: new GitHubPullRequestUpsertHandler(),
});
