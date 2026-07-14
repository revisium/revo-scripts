import type { ScriptExecutionBindings } from '../../host/bindings/script-execution-bindings.js';
import type { ScriptIdentityPin } from './script-identity-pin.js';
import type { ScriptProviderPin } from './script-provider-pin.js';

export interface RevoScriptExecutionRequest {
  readonly executionId: string;
  readonly script: ScriptIdentityPin;
  readonly input: unknown;
  readonly providers: readonly ScriptProviderPin[];
  readonly bindings: ScriptExecutionBindings;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}
