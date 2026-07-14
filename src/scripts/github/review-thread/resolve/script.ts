import { defineScript } from '../../../../runtime/definition/define-script.js';
import { GitHubReviewThreadResolveHandler } from './github-review-thread-resolve.handler.js';
import { githubReviewThreadResolveManifest } from './manifest.js';
import {
  githubReviewThreadResolveInputSchema,
  githubReviewThreadResolveResultSchema,
} from './schemas.js';
import type {
  GitHubReviewThreadResolveInput,
  GitHubReviewThreadResolveResources,
  GitHubReviewThreadResolveResult,
} from './types.js';

export const githubReviewThreadResolveScript = defineScript<
  GitHubReviewThreadResolveInput,
  GitHubReviewThreadResolveResult,
  GitHubReviewThreadResolveResources
>({
  manifest: githubReviewThreadResolveManifest,
  inputSchema: githubReviewThreadResolveInputSchema,
  resultSchema: githubReviewThreadResolveResultSchema,
  implementation: { id: '@revisium/revo-scripts/github/review-thread-resolve', version: '1.0.0' },
  handler: new GitHubReviewThreadResolveHandler(),
});
