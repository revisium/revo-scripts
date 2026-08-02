import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { echoInputSchema, echoResultSchema } from './schemas.js';

export const echoManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:system/echo',
  version: 1,
  summary: 'Returns one bounded { message: string } object unchanged.',
  inputSchemaId: echoInputSchema.id,
  resultSchemaId: echoResultSchema.id,
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
