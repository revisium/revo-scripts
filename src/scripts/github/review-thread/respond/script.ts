import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubReviewThreadRespondHandler } from './github-review-thread-respond.handler.js';
import { githubReviewThreadRespondManifest } from './manifest.js';
import {
  githubReviewThreadRespondInputSchema,
  githubReviewThreadRespondResultSchema,
} from './schemas.js';
import type {
  GitHubReviewThreadRespondInput,
  GitHubReviewThreadRespondResources,
  GitHubReviewThreadRespondResult,
} from './types.js';

export const githubReviewThreadRespondScript = defineScript<
  GitHubReviewThreadRespondInput,
  GitHubReviewThreadRespondResult,
  GitHubReviewThreadRespondResources
>({
  manifest: githubReviewThreadRespondManifest,
  inputSchema: githubReviewThreadRespondInputSchema,
  resultSchema: githubReviewThreadRespondResultSchema,
  implementation: builtInImplementation('script:github/review-threads/respond', '1.0.0'),
  handler: new GitHubReviewThreadRespondHandler(),
});
