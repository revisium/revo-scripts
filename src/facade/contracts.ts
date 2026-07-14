import type { ScriptManifestV1, ScriptProviderContractRef } from '../core/spec/script-manifest.js';
import type { ScriptExecutionResult } from '../core/spec/script-result.js';
import type { ScriptExecutionBindings, RevoScriptsHost } from '../host/contracts.js';
import type {
  ScriptProviderDescriptor,
  ScriptProviderRegistration,
} from '../host/provider-module.js';
import type { ScriptDefinitionModule } from './definition-module.js';

export interface ScriptIdentityPin {
  readonly id: `script:${string}`;
  readonly version: string;
  readonly definitionDigest: `sha256:${string}`;
}

export interface ScriptProviderPin {
  readonly name: string;
  readonly resource: string;
  readonly id: `provider:${string}`;
  readonly contract: ScriptProviderContractRef;
  readonly implementationDigest: `sha256:${string}`;
  readonly workspace: 'required' | 'none';
  readonly provenance: Readonly<{
    packageName: string;
    packageVersion: string;
  }>;
}

export interface ScriptPlanDescriptor {
  readonly script: ScriptIdentityPin;
  readonly providers: readonly ScriptProviderPin[];
  readonly manifest: ScriptManifestV1;
}

export interface RevoScriptExecutionRequest {
  readonly executionId: string;
  readonly script: ScriptIdentityPin;
  readonly input: unknown;
  readonly providers: readonly ScriptProviderPin[];
  readonly bindings: ScriptExecutionBindings;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface RevoScriptsOptions {
  readonly definitions: readonly ScriptDefinitionModule[];
  readonly providers: readonly ScriptProviderRegistration[];
  readonly host: RevoScriptsHost;
}

export interface RevoScripts {
  resolveForPlan(script: {
    readonly id: `script:${string}`;
    readonly version: string;
  }): ScriptPlanDescriptor;
  execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
}
