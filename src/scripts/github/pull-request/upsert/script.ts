import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubPullRequestUpsertHandler } from './github-pull-request-upsert.handler.js';
import { githubPullRequestUpsertManifest } from './manifest.js';
import {
  githubPullRequestUpsertInputSchema,
  githubPullRequestUpsertResultSchema,
  type GitHubPullRequestUpsertInput,
  type GitHubPullRequestUpsertResources,
  type GitHubPullRequestUpsertResult,
} from './schemas.js';

export const githubPullRequestUpsertScript = defineScript<
  GitHubPullRequestUpsertInput,
  GitHubPullRequestUpsertResult,
  GitHubPullRequestUpsertResources
>({
  manifest: githubPullRequestUpsertManifest,
  inputSchema: githubPullRequestUpsertInputSchema,
  resultSchema: githubPullRequestUpsertResultSchema,
  implementation: builtInImplementation(githubPullRequestUpsertManifest.id, '1.0.0'),
  handler: new GitHubPullRequestUpsertHandler(),
});
