import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';
import type { RevoScriptExecutionRequest } from './revo-script-execution-request.js';

export interface RevoScripts {
  execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
}
