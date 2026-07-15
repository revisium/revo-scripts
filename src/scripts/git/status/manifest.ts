import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { gitStatusInputSchema, gitStatusResultSchema } from './schemas.js';

export const gitStatusManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:git/status',
  version: '1.0.0',
  summary: 'Reads one immutable bounded workspace-change snapshot.',
  inputSchemaId: gitStatusInputSchema.id,
  resultSchemaId: gitStatusResultSchema.id,
  effectClass: 'read',
  permissions: ['git.status.read'],
  resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
  providers: [{ name: 'git', contract: 'revo.provider.git/v1', resource: 'repository' }],
  credentials: [],
  effects: ['git.read'],
  timeout: { wallClockMs: 5_000 },
  retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
  idempotency: 'read-only',
  redaction: {
    inputPaths: [],
    resultPaths: [],
    errorPaths: [],
    eventPaths: [],
  },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
