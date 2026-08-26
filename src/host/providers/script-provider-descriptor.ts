import type {
  ScriptOperation,
  ScriptProviderContractRef,
} from '../../runtime/spec/manifest/index.js';
import type { ScriptProviderProvenance } from './script-provider-provenance.js';
import type { ScriptProviderWorkspaceMode } from './script-provider-workspace-mode.js';

export interface ScriptProviderDescriptor {
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance: Readonly<ScriptProviderProvenance>;
  readonly operations: readonly ScriptOperation[];
  readonly workspace: ScriptProviderWorkspaceMode;
}
