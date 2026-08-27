import type { ScriptProviderDescriptor } from '../host/providers/script-provider-descriptor.js';
import type { ScriptRegistry } from '../runtime/registry/contracts/script-registry.js';
import { ScriptFault } from '../runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../runtime/spec/manifest/index.js';
import { ScriptBindingPreparer } from './bindings/script-binding-preparer.js';
import type { ResolvedRevoScriptsOptions } from './contracts/revo-scripts-options.js';
import type { RevoScripts } from './contracts/revo-scripts.js';
import {
  AttemptCancellationResultSchema,
  ScriptAttemptRefSchema,
  ScriptAttemptResultSchema,
  ScriptReconciliationResultSchema,
} from './contracts/script-attempt-schemas.js';
import type {
  AttemptCancellationResult,
  AttemptContext,
  PreparedScriptBinding,
  ScriptAttemptExecutionContext,
  ScriptAttemptInput,
  ScriptAttemptRef,
  ScriptAttemptResult,
  ScriptBindingInput,
  ScriptReconciliationResult,
} from './contracts/script-attempt.js';
import { AttemptExecutionCoordinator } from './execution/attempt-execution-coordinator.js';
import { AttemptState } from './execution/attempt-state.js';
import { createProviderCatalog } from './providers/create-provider-catalog.js';
import type { ProviderCatalog } from './providers/provider-catalog.js';
import { createDefinitionRegistry } from './registration/definition-registry.js';

export class DefaultRevoScripts implements RevoScripts {
  private readonly registry: ScriptRegistry;
  private readonly catalog: ProviderCatalog;
  private readonly bindingPreparer: ScriptBindingPreparer;
  private readonly coordinator: AttemptExecutionCoordinator;
  private readonly state: AttemptState;

  constructor(options: ResolvedRevoScriptsOptions) {
    this.registry = createDefinitionRegistry(options);
    this.catalog = createProviderCatalog(options.providers);
    this.catalog.requireCoverage(this.registry);
    this.bindingPreparer = new ScriptBindingPreparer(options, this.registry, this.catalog);
    this.state = new AttemptState();
    this.coordinator = new AttemptExecutionCoordinator(
      options,
      this.registry,
      this.catalog,
      this.state,
    );
  }

  async prepareBinding(
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<PreparedScriptBinding> {
    return await this.bindingPreparer.prepare(input, context);
  }

  async executeAttempt(
    input: ScriptAttemptInput,
    context: ScriptAttemptExecutionContext,
  ): Promise<ScriptAttemptResult> {
    return await this.assertPublicResult(
      ScriptAttemptResultSchema,
      await this.coordinator.execute(input, context),
      'Script attempt result is invalid.',
    );
  }

  async cancelAttempt(
    input: ScriptAttemptRef,
    context: AttemptContext,
  ): Promise<AttemptCancellationResult> {
    return await this.assertPublicResult(
      AttemptCancellationResultSchema,
      this.state.cancel(await this.normalizeRef(input, context)),
      'Script cancellation result is invalid.',
    );
  }

  async reconcileAttempt(
    input: ScriptAttemptInput,
    context: AttemptContext,
  ): Promise<ScriptReconciliationResult> {
    return await this.assertPublicResult(
      ScriptReconciliationResultSchema,
      this.state.reconcile(
        await this.normalizeRef(
          { executionId: input.executionId, attemptId: input.attemptId },
          context,
        ),
      ),
      'Script reconciliation result is invalid.',
    );
  }

  listManifests(): readonly ScriptManifestV1[] {
    return this.registry.listManifests();
  }

  listProviderImplementations(): readonly ScriptProviderDescriptor[] {
    return this.catalog.descriptors;
  }

  private async normalizeRef(
    input: ScriptAttemptRef,
    context: AttemptContext,
  ): Promise<ScriptAttemptRef> {
    if (!isAbortSignal(context?.signal)) {
      throw new ScriptFault('revo.script.validation.attempt', 'Script attempt context is invalid.');
    }
    const validated = await ScriptAttemptRefSchema.validate(input);
    if (!validated.ok) {
      throw new ScriptFault(
        'revo.script.validation.attempt',
        'Script attempt identity is invalid.',
      );
    }
    return structuredClone(validated.value);
  }

  private async assertPublicResult<T>(
    schema: { validate(value: unknown): Promise<{ ok: boolean }> },
    value: T,
    message: string,
  ): Promise<T> {
    const validated = await schema.validate(value);
    if (!validated.ok) {
      throw new ScriptFault('revo.script.execution.invariant', message);
    }
    return structuredClone(value);
  }
}

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  'aborted' in value &&
  typeof value.aborted === 'boolean' &&
  'addEventListener' in value &&
  typeof value.addEventListener === 'function';
