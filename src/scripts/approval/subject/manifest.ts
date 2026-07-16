import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { approvalSubjectInputSchema, approvalSubjectResultSchema } from './schemas.js';

export const approvalSubjectManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:approval/subject',
  version: 1,
  summary: 'Constructs one provider-neutral approval subject.',
  inputSchemaId: approvalSubjectInputSchema.id,
  resultSchemaId: approvalSubjectResultSchema.id,
  effectClass: 'pure',
  permissions: [],
  resources: [],
  providers: [],
  credentials: [],
  effects: [],
  timeout: { wallClockMs: 1_000 },
  retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
  idempotency: 'read-only',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
