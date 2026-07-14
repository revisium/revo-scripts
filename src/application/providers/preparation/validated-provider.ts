import type { ScriptResourceBinding } from '../../../host/bindings/script-resource-binding.js';
import type { ScriptProviderModule } from '../../../host/providers/script-provider-module.js';
import type {
  ScriptProviderRequirement,
  ScriptResourceRequirement,
} from '../../../runtime/spec/manifest/index.js';

export interface ValidatedProvider {
  readonly requirement: ScriptProviderRequirement;
  readonly resource: ScriptResourceRequirement;
  readonly binding: ScriptResourceBinding;
  readonly provider: ScriptProviderModule;
}
