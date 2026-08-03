import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { pureScriptManifestPolicy } from '../../shared/pure-script-manifest-policy.js';
import { approvalSubjectInputSchema, approvalSubjectResultSchema } from './schemas.js';

export const approvalSubjectManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:approval/subject',
  version: 1,
  summary: 'Constructs one provider-neutral approval subject.',
  inputSchemaId: approvalSubjectInputSchema.id,
  resultSchemaId: approvalSubjectResultSchema.id,
  ...pureScriptManifestPolicy(),
} as const satisfies ScriptManifestV1;
