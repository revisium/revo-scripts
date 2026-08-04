import { defineScript } from '../../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../../runtime/generated/built-in-implementation.js';
import { GitHubReviewThreadResolveHandler } from './github-review-thread-resolve.handler.js';
import { githubReviewThreadResolveManifest } from './manifest.js';
import {
  githubReviewThreadResolveInputSchema,
  githubReviewThreadResolveResultSchema,
  type GitHubReviewThreadResolveInput,
  type GitHubReviewThreadResolveResources,
  type GitHubReviewThreadResolveResult,
} from './schemas.js';

export const githubReviewThreadResolveScript = defineScript<
  GitHubReviewThreadResolveInput,
  GitHubReviewThreadResolveResult,
  GitHubReviewThreadResolveResources
>({
  manifest: githubReviewThreadResolveManifest,
  inputSchema: githubReviewThreadResolveInputSchema,
  resultSchema: githubReviewThreadResolveResultSchema,
  implementation: builtInImplementation(githubReviewThreadResolveManifest.id, '1.0.0'),
  handler: new GitHubReviewThreadResolveHandler(),
});
