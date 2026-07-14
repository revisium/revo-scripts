import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ScriptIdentityPin } from './script-identity-pin.js';
import type { ScriptProviderPin } from './script-provider-pin.js';

export interface ScriptPlanDescriptor {
  readonly script: ScriptIdentityPin;
  readonly providers: readonly ScriptProviderPin[];
  readonly manifest: ScriptManifestV1;
}
