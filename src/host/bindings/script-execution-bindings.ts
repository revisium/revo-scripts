import type { ScriptCredentialBinding } from './script-credential-binding.js';
import type { ScriptResourceBinding } from './script-resource-binding.js';

export interface ScriptExecutionBindings {
  readonly resources: Readonly<Record<string, ScriptResourceBinding>>;
  readonly credentials: Readonly<Record<string, ScriptCredentialBinding>>;
}
