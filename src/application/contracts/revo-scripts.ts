import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type {
  AttemptCancellationResult,
  AttemptContext,
  PreparedScriptBinding,
  ScriptAttemptExecutionContext,
  ScriptAttemptInput,
  ScriptAttemptRef,
  ScriptAttemptResult,
  ScriptBindingInput,
  ScriptReconciliationResult,
} from './script-attempt.js';

export interface RevoScripts {
  prepareBinding(
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<PreparedScriptBinding>;
  executeAttempt(
    input: ScriptAttemptInput,
    context: ScriptAttemptExecutionContext,
  ): Promise<ScriptAttemptResult>;
  cancelAttempt(
    input: ScriptAttemptRef,
    context: AttemptContext,
  ): Promise<AttemptCancellationResult>;
  reconcileAttempt(
    input: ScriptAttemptInput,
    context: AttemptContext,
  ): Promise<ScriptReconciliationResult>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
}
