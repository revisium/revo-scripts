import type { ScriptManifestV1 } from '../manifest/script-manifest.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptSchema } from '../schema/script-schema.js';
import type { ScriptHandler } from './script-handler.js';
import type { ScriptImplementationIdentity } from './script-implementation-identity.js';

export interface ScriptDefinitionInput<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestV1;
  readonly inputSchema: ScriptSchema<I>;
  readonly resultSchema: ScriptSchema<O>;
  readonly handler: ScriptHandler<I, O, R>;
  readonly implementation: ScriptImplementationIdentity;
}
