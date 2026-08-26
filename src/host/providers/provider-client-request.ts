import type {
  ScriptManifestV1,
  ScriptOperation,
  ScriptResourceAccess,
  ScriptProviderRequirement,
  ScriptResourceRequirement,
} from '../../runtime/spec/manifest/index.js';
import type { CredentialLease } from '../credentials/resolved-credential.js';
import type { TrustedWorkspaceAllocation } from '../workspaces/trusted-workspace-allocation.js';

export interface PreparedProviderResourceBinding {
  readonly resourceId: string;
  readonly kind: 'repository';
  readonly repositoryId: string;
  readonly workspaceId?: string;
  readonly access: ScriptResourceAccess;
  readonly grant: Readonly<{
    readonly permissions: readonly string[];
    readonly operations: readonly ScriptOperation[];
  }>;
  readonly providerCoordinates: Readonly<Record<string, unknown>>;
}

export interface ProviderClientRequest {
  readonly manifest: ScriptManifestV1;
  readonly provider: ScriptProviderRequirement;
  readonly requirement: ScriptResourceRequirement;
  readonly binding: PreparedProviderResourceBinding;
  readonly workspace?: TrustedWorkspaceAllocation;
  readonly credentials: Readonly<Record<string, CredentialLease>>;
  readonly signal: AbortSignal;
}
