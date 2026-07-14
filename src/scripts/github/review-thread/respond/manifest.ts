import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubReviewThreadRespondInputSchema,
  githubReviewThreadRespondResultSchema,
} from './schemas.js';

export const githubReviewThreadRespondManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/review-thread-respond',
  version: '1.0.0',
  summary: 'Replies once to one review thread on an exact pull request head.',
  inputSchemaId: githubReviewThreadRespondInputSchema.id,
  resultSchemaId: githubReviewThreadRespondResultSchema.id,
  effectClass: 'write',
  permissions: ['github.review-thread.respond'],
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
