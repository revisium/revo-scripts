import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
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
  effectClass: 'publish',
  permissions: ['github.review-thread.respond'],
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
