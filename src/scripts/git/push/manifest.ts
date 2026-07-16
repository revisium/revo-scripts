import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { gitPushInputSchema, gitPushResultSchema } from './schemas.js';

export const gitPushManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:git/push',
  version: 1,
  summary: 'Publishes one exact pinned Git commit without force.',
  inputSchemaId: gitPushInputSchema.id,
  resultSchemaId: gitPushResultSchema.id,
  effectClass: 'publish',
  permissions: ['git.push.publish'],
  resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
  providers: [{ name: 'git', contract: 'revo.provider.git/v1', resource: 'repository' }],
  credentials: [],
  effects: ['git.read', 'git.remote-write'],
  timeout: { wallClockMs: 30_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
