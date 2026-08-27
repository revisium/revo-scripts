import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import { githubPublishManifestPolicyV1 } from '../../shared/github-publish-manifest-policy-v1.js';
import {
  githubReviewThreadResolveInputSchema,
  githubReviewThreadResolveResultSchema,
} from './schemas.js';

export const githubReviewThreadResolveManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/review-threads/resolve',
  version: 1,
  summary: 'Resolves only review threads backed by exact response proofs.',
  inputSchemaId: githubReviewThreadResolveInputSchema.id,
  resultSchemaId: githubReviewThreadResolveResultSchema.id,
  ...githubPublishManifestPolicyV1({
    permission: 'github.review-thread.resolve',
    wallClockMs: 60_000,
    maxAttempts: 3,
    backoffMs: [250, 1_000],
  }),
} as const satisfies ScriptManifestV1;
