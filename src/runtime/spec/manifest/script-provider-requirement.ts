import type { ScriptProviderContractRef } from './script-provider-contract-ref.js';

export interface ScriptProviderRequirement {
  readonly name: string;
  readonly contract: ScriptProviderContractRef;
  readonly resource: string;
}
