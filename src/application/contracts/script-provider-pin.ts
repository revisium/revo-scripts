import type { ScriptProviderProvenance } from '../../host/providers/script-provider-provenance.js';
import type { ScriptProviderWorkspaceMode } from '../../host/providers/script-provider-workspace-mode.js';
import type { ScriptProviderContractRef } from '../../runtime/spec/manifest/index.js';

export interface ScriptProviderPin {
  readonly name: string;
  readonly resource: string;
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly workspace: ScriptProviderWorkspaceMode;
  readonly provenance: Readonly<ScriptProviderProvenance>;
}
