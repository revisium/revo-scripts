import type { ScriptManifestAuthoringV1 } from '../manifest/script-manifest.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptSchema } from '../schema/script-schema.js';
import type { ScriptHandler } from './script-handler.js';
import type { ScriptImplementationIdentity } from './script-implementation-identity.js';

export interface ScriptDefinitionInput<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestAuthoringV1;
  readonly inputSchema: ScriptSchema<I>;
  readonly resultSchema: ScriptSchema<O>;
  readonly implementation: ScriptImplementationIdentity;
  readonly handler: ScriptHandler<I, O, R>;
}
