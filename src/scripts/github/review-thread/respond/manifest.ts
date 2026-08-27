import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import { githubPublishManifestPolicyV1 } from '../../shared/github-publish-manifest-policy-v1.js';
import {
  githubReviewThreadRespondInputSchema,
  githubReviewThreadRespondResultSchema,
} from './schemas.js';

export const githubReviewThreadRespondManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/review-threads/respond',
  version: 1,
  summary: 'Replies once to each selected review thread on an exact pull request head.',
  inputSchemaId: githubReviewThreadRespondInputSchema.id,
  resultSchemaId: githubReviewThreadRespondResultSchema.id,
  ...githubPublishManifestPolicyV1({
    permission: 'github.review-thread.respond',
    wallClockMs: 60_000,
    maxAttempts: 3,
    backoffMs: [250, 1_000],
  }),
} as const satisfies ScriptManifestV1;
