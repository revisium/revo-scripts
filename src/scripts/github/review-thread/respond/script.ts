import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubReviewThreadRespondHandler } from './github-review-thread-respond.handler.js';
import { githubReviewThreadRespondManifest } from './manifest.js';
import {
  githubReviewThreadRespondInputSchema,
  githubReviewThreadRespondResultSchema,
  type GitHubReviewThreadRespondInput,
  type GitHubReviewThreadRespondResources,
  type GitHubReviewThreadRespondResult,
} from './schemas.js';

export const githubReviewThreadRespondScript = defineScript<
  GitHubReviewThreadRespondInput,
  GitHubReviewThreadRespondResult,
  GitHubReviewThreadRespondResources
>({
  manifest: githubReviewThreadRespondManifest,
  inputSchema: githubReviewThreadRespondInputSchema,
  resultSchema: githubReviewThreadRespondResultSchema,
  implementation: builtInImplementation(githubReviewThreadRespondManifest.id, '1.0.0'),
  handler: new GitHubReviewThreadRespondHandler(),
});
