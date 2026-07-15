import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubReviewThreadResolveInputSchema,
  githubReviewThreadResolveResultSchema,
} from './schemas.js';

export const githubReviewThreadResolveManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/review-thread-resolve',
  version: '1.0.0',
  summary: 'Resolves one review thread on an exact pull request head.',
  inputSchemaId: githubReviewThreadResolveInputSchema.id,
  resultSchemaId: githubReviewThreadResolveResultSchema.id,
  effectClass: 'write',
  permissions: ['github.review-thread.resolve'],
  resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read', 'github.write'],
  timeout: { wallClockMs: 20_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
