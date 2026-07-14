import type { EventSink } from '../core/spec/script-events.js';
import type { ScriptClock } from '../core/spec/script-execution.js';
import type { ScriptEffect, ScriptResourceAccess } from '../core/spec/script-manifest.js';

export interface ScriptResourceBinding {
  readonly resourceId: string;
  readonly kind: 'repository';
  readonly repositoryId: string;
  readonly workspaceId?: string;
  readonly access: ScriptResourceAccess;
  readonly grant: Readonly<{
    readonly permissions: readonly string[];
    readonly effects: readonly ScriptEffect[];
  }>;
  readonly providerCoordinates: Readonly<Record<string, unknown>>;
}

export interface ScriptCredentialBinding {
  readonly alias: string;
  readonly provider: string;
}

export interface ScriptExecutionBindings {
  readonly resources: Readonly<Record<string, ScriptResourceBinding>>;
  readonly credentials: Readonly<Record<string, ScriptCredentialBinding>>;
}

export interface TrustedWorkspaceAllocation {
  readonly workspaceId: string;
  readonly repositoryId: string;
  readonly absolutePath: string;
}

export interface WorkspaceResolver {
  resolve(workspaceId: string, signal: AbortSignal): Promise<TrustedWorkspaceAllocation>;
}

export interface ResolvedCredential {
  readonly alias: string;
  readonly provider: string;
  readonly secret: string;
  dispose(): Promise<void>;
}

export interface CredentialResolver {
  resolve(binding: ScriptCredentialBinding, signal: AbortSignal): Promise<ResolvedCredential>;
}

export interface RevoScriptsHost {
  readonly workspaces: WorkspaceResolver;
  readonly credentials: CredentialResolver;
  readonly events: EventSink;
  readonly clock?: ScriptClock;
}
