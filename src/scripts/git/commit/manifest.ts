import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { gitCommitInputSchema, gitCommitResultSchema } from './schemas.js';

export const gitCommitManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:git/commit',
  version: 1,
  summary: 'Creates one exact commit from an approved Git tree.',
  inputSchemaId: gitCommitInputSchema.id,
  resultSchemaId: gitCommitResultSchema.id,
  effectClass: 'write',
  permissions: ['git.commit.write'],
  resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
  providers: [{ name: 'git', contract: 'revo.provider.git/v1', resource: 'repository' }],
  credentials: [],
  effects: ['git.read', 'git.write'],
  timeout: { wallClockMs: 15_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [250] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
