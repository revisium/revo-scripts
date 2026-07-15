import type { ScriptProviderDescriptor } from '../host/providers/script-provider-descriptor.js';
import type { ScriptRegistry } from '../runtime/registry/contracts/script-registry.js';
import type { ScriptManifestV1 } from '../runtime/spec/manifest/index.js';
import type { ScriptExecutionResult } from '../runtime/spec/result/index.js';
import type { RevoScriptExecutionRequest } from './contracts/revo-script-execution-request.js';
import type { ResolvedRevoScriptsOptions } from './contracts/revo-scripts-options.js';
import type { RevoScripts } from './contracts/revo-scripts.js';
import type { ScriptPlanDescriptor } from './contracts/script-plan-descriptor.js';
import { ScriptExecutionCoordinator } from './execution/script-execution-coordinator.js';
import { createProviderCatalog } from './providers/create-provider-catalog.js';
import type { ProviderCatalog } from './providers/provider-catalog.js';
import { createDefinitionRegistry } from './registration/definition-registry.js';

export class DefaultRevoScripts implements RevoScripts {
  private readonly registry: ScriptRegistry;
  private readonly catalog: ProviderCatalog;
  private readonly coordinator: ScriptExecutionCoordinator;

  constructor(options: ResolvedRevoScriptsOptions) {
    this.registry = createDefinitionRegistry(options);
    this.catalog = createProviderCatalog(options.providers);
    this.catalog.requireCoverage(this.registry);
    this.coordinator = new ScriptExecutionCoordinator(options, this.registry, this.catalog);
  }

  resolveForPlan(script: {
    readonly id: `script:${string}`;
    readonly version: string;
  }): ScriptPlanDescriptor {
    return this.catalog.resolveForPlan(this.registry, script);
  }

  async execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>> {
    return this.coordinator.execute(request);
  }

  listManifests(): readonly ScriptManifestV1[] {
    return this.registry.listManifests();
  }

  listProviderImplementations(): readonly ScriptProviderDescriptor[] {
    return this.catalog.descriptors;
  }
}
