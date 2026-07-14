import type { ScriptProviderModule } from './script-provider-module.js';

export interface ScriptProviderRegistration {
  readonly module: ScriptProviderModule;
  readonly useForNewPlans: boolean;
}
