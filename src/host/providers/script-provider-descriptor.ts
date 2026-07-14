import type { ScriptEffect, ScriptProviderContractRef } from '../../runtime/spec/manifest/index.js';
import type { ScriptProviderProvenance } from './script-provider-provenance.js';
import type { ScriptProviderWorkspaceMode } from './script-provider-workspace-mode.js';

export interface ScriptProviderDescriptor {
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance: Readonly<ScriptProviderProvenance>;
  readonly effects: readonly ScriptEffect[];
  readonly workspace: ScriptProviderWorkspaceMode;
  readonly useForNewPlans: boolean;
}
