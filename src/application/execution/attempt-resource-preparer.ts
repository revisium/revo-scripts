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
      for (const providerRequirement of manifest.providers) {
        const requirement = manifest.resources.find(
          (resource) => resource.name === providerRequirement.resource,
        );
        if (requirement === undefined) {
          throw new ScriptFault(
            'revo.script.validation.manifest',
            'Provider requirement references an unknown resource.',
          );
        }
        const resource = binding.resources[requirement.name];
        if (resource === undefined) {
          throw new ScriptFault(
            'revo.script.permission.resource',
            `Resource binding ${requirement.name} does not match the script manifest.`,
          );
        }
        const provider = this.catalog.requireProvider(providerRequirement);
        // eslint-disable-next-line no-await-in-loop -- preserve ordered acquisition for deterministic cleanup.
        const workspace = await this.acquireWorkspace(provider.workspace, resource, signal);
        // eslint-disable-next-line no-await-in-loop -- credential leases are recorded before the next provider starts.
        const providerCredentials = await this.acquireCredentials(
          manifest,
          providerRequirement.name,
          binding,
          signal,
          credentials,
        );
        // eslint-disable-next-line no-await-in-loop -- one provider may own the resource client lifecycle.
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
        const target = clientsByResource.get(requirement.name);
        if (target === undefined) {
          throw new ScriptFault(
            'revo.script.permission.resource',
            `Provider references unknown resource ${requirement.name}.`,
          );
        }
        for (const [name, client] of Object.entries(prepared.clients)) {
          if (Object.hasOwn(target, name)) {
            throw new ScriptFault(
              'revo.script.provider.client_conflict',
              `Provider client ${name} is already attached to resource ${requirement.name}.`,
            );
          }
          target[name] = client;
        }
      }

      const resources: Record<string, ScriptResourceHandle<object>> = {};
      for (const requirement of manifest.resources) {
        const resource = binding.resources[requirement.name];
        if (resource === undefined) {
          throw new ScriptFault(
            'revo.script.permission.resource',
            `Resource binding ${requirement.name} does not match the script manifest.`,
          );
        }
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
      return new AcquiredAttemptResources(resources, providers, credentials);
    } catch (error: unknown) {
      try {
        await disposeAll(providers, credentials);
      } catch (cleanup: unknown) {
        throw new PartialAcquireFailure(
          error,
          cleanup instanceof ScriptFault
            ? cleanup
            : new ScriptFault(
                'revo.script.execution.cleanup',
                'Provider resources could not be disposed safely.',
                { cause: cleanup },
              ),
        );
      }
      throw error;
    }
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
      if (descriptor === undefined || descriptor.provider !== requirement.provider) {
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
