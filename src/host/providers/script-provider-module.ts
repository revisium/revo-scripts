import type { ScriptEffect, ScriptProviderContractRef } from '../../runtime/spec/manifest/index.js';
import type { ScriptSchema } from '../../runtime/spec/schema/index.js';
import type { PreparedProviderClients } from './prepared-provider-clients.js';
import type { ProviderClientRequest } from './provider-client-request.js';
import type { ScriptProviderProvenance } from './script-provider-provenance.js';
import type { ScriptProviderWorkspaceMode } from './script-provider-workspace-mode.js';

export interface ScriptProviderModule {
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly provenance: Readonly<ScriptProviderProvenance>;
  readonly effects: readonly ScriptEffect[];
  readonly workspace: ScriptProviderWorkspaceMode;
  readonly coordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
  createResourceClients(request: ProviderClientRequest): Promise<PreparedProviderClients>;
}
