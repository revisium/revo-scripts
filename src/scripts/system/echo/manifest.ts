import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { pureScriptManifestPolicy } from '../../shared/pure-script-manifest-policy.js';
import { echoInputSchema, echoResultSchema } from './schemas.js';

export const echoManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:system/echo',
  version: 1,
  summary: 'Returns one bounded { message: string } object unchanged.',
  inputSchemaId: echoInputSchema.id,
  resultSchemaId: echoResultSchema.id,
  ...pureScriptManifestPolicy(),
} as const satisfies ScriptManifestV1;
