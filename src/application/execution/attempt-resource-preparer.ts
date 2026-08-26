import type { CredentialLease } from '../../host/credentials/resolved-credential.js';
import type { PreparedProviderClients } from '../../host/providers/prepared-provider-clients.js';
import type { TrustedWorkspaceAllocation } from '../../host/workspaces/trusted-workspace-allocation.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ScriptResourceHandle } from '../../runtime/spec/resources/index.js';
import type { ResolvedRevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import type { PreparedScriptBinding } from '../contracts/script-attempt.js';
import type { ProviderCatalog } from '../providers/provider-catalog.js';
import { AcquiredAttemptResources, disposeAll } from './acquired-attempt-resources.js';
import { PartialAcquireFailure } from './partial-acquire-failure.js';

type ProviderRequirement = ScriptManifestV1['providers'][number];
type ResourceRequirement = ScriptManifestV1['resources'][number];
type PreparedResource = PreparedScriptBinding['resources'][string];

export class AttemptResourcePreparer {
  private readonly options: ResolvedRevoScriptsOptions;
  private readonly catalog: ProviderCatalog;

  constructor(options: ResolvedRevoScriptsOptions, catalog: ProviderCatalog) {
    this.options = options;
    this.catalog = catalog;
  }

  async acquire(
    manifest: ScriptManifestV1,
    binding: PreparedScriptBinding,
    signal: AbortSignal,
  ): Promise<AcquiredAttemptResources> {
    const clientsByResource = new Map<string, Record<string, object>>(
      manifest.resources.map((resource) => [resource.name, {}]),
    );
    const providers: PreparedProviderClients[] = [];
    const credentials: CredentialLease[] = [];

    try {
      await this.acquireProviderClients(
        manifest,
        binding,
        signal,
        clientsByResource,
        providers,
        credentials,
      );
      return new AcquiredAttemptResources(
        this.createResourceHandles(manifest, binding, clientsByResource),
        providers,
        credentials,
      );
    } catch (error: unknown) {
      return this.disposeAfterFailedAcquire(error, providers, credentials);
    }
  }

  private async acquireProviderClients(
    manifest: ScriptManifestV1,
    binding: PreparedScriptBinding,
    signal: AbortSignal,
    clientsByResource: Map<string, Record<string, object>>,
    providers: PreparedProviderClients[],
    credentials: CredentialLease[],
  ): Promise<void> {
    for (const providerRequirement of manifest.providers) {
      // eslint-disable-next-line no-await-in-loop -- preserve ordered acquisition for deterministic cleanup.
      await this.acquireProviderClientsForRequirement(
        manifest,
        binding,
        providerRequirement,
        signal,
        clientsByResource,
        providers,
        credentials,
      );
    }
  }

  private async acquireProviderClientsForRequirement(
    manifest: ScriptManifestV1,
    binding: PreparedScriptBinding,
    providerRequirement: ProviderRequirement,
    signal: AbortSignal,
    clientsByResource: Map<string, Record<string, object>>,
    providers: PreparedProviderClients[],
    credentials: CredentialLease[],
  ): Promise<void> {
    const requirement = this.requireResourceRequirement(manifest, providerRequirement);
    const resource = this.requireBoundResource(binding, requirement);
    const provider = this.catalog.requireProvider(providerRequirement);
    const workspace = await this.acquireWorkspace(provider.workspace, resource, signal);
    const providerCredentials = await this.acquireCredentials(
      manifest,
      providerRequirement.name,
      binding,
      signal,
      credentials,
    );
    const prepared = await provider.createResourceClients({
      manifest,
      provider: providerRequirement,
      requirement,
      binding: {
        resourceId: resource.descriptor.resourceId,
        kind: resource.descriptor.kind,
        repositoryId: resource.descriptor.repositoryId,
        ...(resource.workspaceRef === undefined ? {} : { workspaceId: resource.workspaceRef }),
        access: requirement.access,
        grant: {
          permissions: [...resource.descriptor.grant.permissions],
          operations: [...resource.descriptor.grant.operations],
        },
        providerCoordinates: structuredClone(resource.descriptor.providerCoordinates),
      },
      ...(workspace === undefined ? {} : { workspace }),
      credentials: providerCredentials,
      signal,
    });
    // Record before merging: a duplicate client name must still dispose this
    // provider's freshly-created clients.
    providers.push(prepared);
    this.mergeProviderClients(clientsByResource, requirement.name, prepared);
  }

  private requireResourceRequirement(
    manifest: ScriptManifestV1,
    providerRequirement: ProviderRequirement,
  ): ResourceRequirement {
    const requirement = manifest.resources.find(
      (resource) => resource.name === providerRequirement.resource,
    );
    if (requirement === undefined) {
      throw new ScriptFault(
        'revo.script.validation.manifest',
        'Provider requirement references an unknown resource.',
      );
    }
    return requirement;
  }

  private requireBoundResource(
    binding: PreparedScriptBinding,
    requirement: ResourceRequirement,
  ): PreparedResource {
    const resource = binding.resources[requirement.name];
    if (resource === undefined) {
      throw new ScriptFault(
        'revo.script.permission.resource',
        `Resource binding ${requirement.name} does not match the script manifest.`,
      );
    }
    return resource;
  }

  private mergeProviderClients(
    clientsByResource: Map<string, Record<string, object>>,
    resourceName: string,
    prepared: PreparedProviderClients,
  ): void {
    const target = clientsByResource.get(resourceName);
    if (target === undefined) {
      throw new ScriptFault(
        'revo.script.permission.resource',
        `Provider references unknown resource ${resourceName}.`,
      );
    }
    for (const [name, client] of Object.entries(prepared.clients)) {
      if (Object.hasOwn(target, name)) {
        throw new ScriptFault(
          'revo.script.provider.client_conflict',
          `Provider client ${name} is already attached to resource ${resourceName}.`,
        );
      }
      target[name] = client;
    }
  }

  private createResourceHandles(
    manifest: ScriptManifestV1,
    binding: PreparedScriptBinding,
    clientsByResource: Map<string, Record<string, object>>,
  ): Record<string, ScriptResourceHandle<object>> {
    const resources: Record<string, ScriptResourceHandle<object>> = {};
    for (const requirement of manifest.resources) {
      const resource = this.requireBoundResource(binding, requirement);
      resources[requirement.name] = {
        name: requirement.name,
        kind: requirement.kind,
        access: requirement.access,
        grant: {
          permissions: [...resource.descriptor.grant.permissions],
          operations: [...resource.descriptor.grant.operations],
        },
        clients: clientsByResource.get(requirement.name) ?? {},
      };
    }
    return resources;
  }

  private async disposeAfterFailedAcquire(
    error: unknown,
    providers: readonly PreparedProviderClients[],
    credentials: readonly CredentialLease[],
  ): Promise<never> {
    try {
      await disposeAll(providers, credentials);
    } catch (cleanupError: unknown) {
      throw new PartialAcquireFailure(
        error,
        cleanupError instanceof ScriptFault
          ? cleanupError
          : new ScriptFault(
              'revo.script.execution.cleanup',
              'Provider resources could not be disposed safely.',
              { cause: cleanupError },
            ),
      );
    }
    throw error;
  }

  private async acquireWorkspace(
    mode: 'none' | 'required',
    resource: PreparedScriptBinding['resources'][string],
    signal: AbortSignal,
  ): Promise<TrustedWorkspaceAllocation | undefined> {
    if (mode === 'none') {
      return undefined;
    }
    if (resource.workspaceRef === undefined) {
      throw new ScriptFault(
        'revo.script.provider.workspace_required',
        'Provider requires a workspace binding.',
      );
    }
    const workspace = await this.options.host.workspaces.acquire(resource.workspaceRef, { signal });
    if (workspace.repositoryId !== resource.descriptor.repositoryId) {
      throw new ScriptFault(
        'revo.script.provider.workspace_mismatch',
        'Resolved workspace does not match the resource binding.',
      );
    }
    return workspace;
  }

  private async acquireCredentials(
    manifest: ScriptManifestV1,
    providerRequirementName: string,
    binding: PreparedScriptBinding,
    signal: AbortSignal,
    leases: CredentialLease[],
  ): Promise<Readonly<Record<string, CredentialLease>>> {
    const credentials: Record<string, CredentialLease> = {};
    for (const requirement of manifest.credentials) {
      if (requirement.providerRequirement !== providerRequirementName) {
        continue;
      }
      const descriptor = binding.credentials[requirement.name];
      if (descriptor?.provider !== requirement.provider) {
        throw new ScriptFault(
          'revo.script.permission.credential',
          `Credential binding ${requirement.name} does not match the manifest.`,
        );
      }
      // eslint-disable-next-line no-await-in-loop -- retain each lease before acquiring the next one.
      const lease = await this.options.host.credentials.acquire(descriptor.alias, { signal });
      // A returned lease is already live. Register it before validating its
      // descriptor so the common partial-acquire cleanup path owns every
      // failure, including a mismatched lease whose disposal itself fails.
      leases.push(lease);
      if (lease.alias !== descriptor.alias || lease.provider !== descriptor.provider) {
        throw new ScriptFault(
          'revo.script.permission.credential',
          `Credential binding ${requirement.name} does not match the manifest.`,
        );
      }
      credentials[requirement.name] = lease;
    }
    return credentials;
  }
}
