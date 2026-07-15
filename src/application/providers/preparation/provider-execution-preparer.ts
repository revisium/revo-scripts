import type { ResolvedCredential } from '../../../host/credentials/resolved-credential.js';
import type { PreparedProviderClients } from '../../../host/providers/prepared-provider-clients.js';
import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { validateExactBindings } from '../../bindings/validate-exact-bindings.js';
import type { RevoScriptExecutionRequest } from '../../contracts/revo-script-execution-request.js';
import type { ResolvedRevoScriptsOptions } from '../../contracts/revo-scripts-options.js';
import { resolveRevoScriptsHost } from '../../contracts/revo-scripts-options.js';
import { throwIfAborted } from '../../execution/execution-abort.js';
import type { ProviderCatalog } from '../provider-catalog.js';
import { createScriptResources } from './create-script-resources.js';
import { disposeProviderResources } from './dispose-provider-resources.js';
import { mergeProviderClients } from './merge-provider-clients.js';
import { PreparedExecution } from './prepared-execution.js';
import { resolveProviderCredentials } from './resolve-provider-credentials.js';
import { resolveProviderWorkspace } from './resolve-provider-workspace.js';
import { validateProviderCoordinates } from './validate-provider-coordinates.js';
import { validateProviders } from './validate-providers.js';
import type { ValidatedProvider } from './validated-provider.js';

/* eslint-disable no-await-in-loop -- Owner: revo-scripts maintainers; provider acquisition and cleanup order must remain deterministic; remove when the lifecycle contract permits parallel preparation. */

interface PreparationState {
  readonly clientsByResource: Map<string, Record<string, object>>;
  readonly providers: PreparedProviderClients[];
  readonly credentials: ResolvedCredential[];
}

export class ProviderExecutionPreparer {
  private readonly options: ResolvedRevoScriptsOptions;
  private readonly catalog: ProviderCatalog;

  constructor(options: ResolvedRevoScriptsOptions, catalog: ProviderCatalog) {
    this.options = options;
    this.catalog = catalog;
  }

  async prepare(
    manifest: ScriptManifestV1,
    request: RevoScriptExecutionRequest,
    signal: AbortSignal,
  ): Promise<PreparedExecution> {
    validateExactBindings(manifest, request);
    const providers = validateProviders(this.catalog, manifest, request);
    await validateProviderCoordinates(providers);
    const state: PreparationState = {
      clientsByResource: new Map(manifest.resources.map((resource) => [resource.name, {}])),
      providers: [],
      credentials: [],
    };

    try {
      await this.prepareProviders(providers, manifest, request, signal, state);
      throwIfAborted(signal);
      return new PreparedExecution(
        createScriptResources(manifest, request, state.clientsByResource),
        state.providers,
        state.credentials,
      );
    } catch (error: unknown) {
      await disposeProviderResources(state.providers, state.credentials);
      throw error;
    }
  }

  private async prepareProviders(
    providers: readonly ValidatedProvider[],
    manifest: ScriptManifestV1,
    request: RevoScriptExecutionRequest,
    signal: AbortSignal,
    state: PreparationState,
  ): Promise<void> {
    for (const validated of providers) {
      const workspace = await resolveProviderWorkspace(
        resolveRevoScriptsHost(this.options).workspaces,
        validated,
        signal,
      );
      const credentials = await resolveProviderCredentials(
        resolveRevoScriptsHost(this.options).credentials,
        manifest,
        validated.requirement,
        request,
        signal,
        state.credentials,
      );
      const prepared = await validated.provider.createResourceClients({
        manifest,
        provider: validated.requirement,
        requirement: validated.resource,
        binding: validated.binding,
        ...(workspace === undefined ? {} : { workspace }),
        credentials,
        signal,
      });
      state.providers.push(prepared);
      throwIfAborted(signal);
      mergeProviderClients(state.clientsByResource, validated.requirement.resource, prepared);
    }
  }
}
