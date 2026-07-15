import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubReviewThreadResolveInputSchema,
  githubReviewThreadResolveResultSchema,
} from './schemas.js';

export const githubReviewThreadResolveManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/review-threads/resolve',
  version: '1.0.0',
  summary: 'Resolves only review threads backed by exact response proofs.',
  inputSchemaId: githubReviewThreadResolveInputSchema.id,
  resultSchemaId: githubReviewThreadResolveResultSchema.id,
  effectClass: 'publish',
  permissions: ['github.review-thread.resolve'],
  resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read', 'github.write'],
  timeout: { wallClockMs: 60_000 },
  retry: { mode: 'transient', maxAttempts: 3, backoffMs: [250, 1_000] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
