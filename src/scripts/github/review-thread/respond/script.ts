import { defineScript } from '../../../../runtime/definition/define-script.js';
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
  implementation: { id: '@revisium/revo-scripts/github/review-thread-respond', version: '1.0.0' },
  handler: new GitHubReviewThreadRespondHandler(),
});
