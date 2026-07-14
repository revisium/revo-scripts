import type {
  ScriptEffect,
  ScriptManifestV1,
  ScriptProviderContractRef,
  ScriptProviderRequirement,
  ScriptResourceRequirement,
} from '../core/spec/script-manifest.js';
import type { ScriptSchema } from '../core/spec/script-schema.js';
import type {
  ResolvedCredential,
  ScriptResourceBinding,
  TrustedWorkspaceAllocation,
} from './contracts.js';

export interface ProviderClientRequest {
  readonly manifest: ScriptManifestV1;
  readonly provider: ScriptProviderRequirement;
  readonly requirement: ScriptResourceRequirement;
  readonly binding: ScriptResourceBinding;
  readonly workspace?: TrustedWorkspaceAllocation;
  readonly credentials: Readonly<Record<string, ResolvedCredential>>;
  readonly signal: AbortSignal;
}

export interface PreparedProviderClients {
  readonly clients: Readonly<Record<string, object>>;
  dispose(): Promise<void>;
}

export interface ScriptProviderModule {
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance: Readonly<{
    packageName: string;
    packageVersion: string;
  }>;
  readonly effects: readonly ScriptEffect[];
  readonly workspace: 'required' | 'none';
  readonly coordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
  createResourceClients(request: ProviderClientRequest): Promise<PreparedProviderClients>;
}

export interface ScriptProviderRegistration {
  readonly module: ScriptProviderModule;
  readonly useForNewPlans: boolean;
}

export interface ScriptProviderDescriptor {
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance: Readonly<{
    packageName: string;
    packageVersion: string;
  }>;
  readonly effects: readonly ScriptEffect[];
  readonly workspace: 'required' | 'none';
  readonly useForNewPlans: boolean;
}
