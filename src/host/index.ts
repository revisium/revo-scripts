export type {
  CredentialDescriptor,
  CredentialResolver,
} from './credentials/credential-resolver.js';
export type { CredentialLease } from './credentials/resolved-credential.js';
export type {
  HostCallContext,
  ResourceResolver,
  ScriptResourceDescriptor,
} from './resources/resource-resolver.js';
export type { PreparedProviderClients } from './providers/prepared-provider-clients.js';
export type { ProviderClientRequest } from './providers/provider-client-request.js';
export type { ScriptProviderDescriptor } from './providers/script-provider-descriptor.js';
export type { ScriptProviderModule } from './providers/script-provider-module.js';
export type { ScriptProviderRegistration } from './providers/script-provider-registration.js';
export type { RevoScriptsHost } from './revo-scripts-host.js';
export type { TrustedWorkspaceAllocation } from './workspaces/trusted-workspace-allocation.js';
export type { WorkspaceDescriptor, WorkspaceResolver } from './workspaces/workspace-resolver.js';
