import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
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
  implementation: builtInImplementation('script:github/review-threads/resolve', '1.0.0'),
  handler: new GitHubReviewThreadResolveHandler(),
});
