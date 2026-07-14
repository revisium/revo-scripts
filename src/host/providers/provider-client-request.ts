import type {
  ScriptManifestV1,
  ScriptProviderRequirement,
  ScriptResourceRequirement,
} from '../../runtime/spec/manifest/index.js';
import type { ScriptResourceBinding } from '../bindings/script-resource-binding.js';
import type { ResolvedCredential } from '../credentials/resolved-credential.js';
import type { TrustedWorkspaceAllocation } from '../workspaces/trusted-workspace-allocation.js';

export interface ProviderClientRequest {
  readonly manifest: ScriptManifestV1;
  readonly provider: ScriptProviderRequirement;
  readonly requirement: ScriptResourceRequirement;
  readonly binding: ScriptResourceBinding;
  readonly workspace?: TrustedWorkspaceAllocation;
  readonly credentials: Readonly<Record<string, ResolvedCredential>>;
  readonly signal: AbortSignal;
}
