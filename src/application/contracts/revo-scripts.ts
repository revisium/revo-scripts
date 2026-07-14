import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';
import type { RevoScriptExecutionRequest } from './revo-script-execution-request.js';
import type { ScriptPlanDescriptor } from './script-plan-descriptor.js';

export interface RevoScripts {
  resolveForPlan(script: {
    readonly id: `script:${string}`;
    readonly version: string;
  }): ScriptPlanDescriptor;
  execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
}
