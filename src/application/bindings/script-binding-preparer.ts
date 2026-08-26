import type { CredentialDescriptor } from '../../host/credentials/credential-resolver.js';
import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptResourceDescriptor } from '../../host/resources/resource-resolver.js';
import { toUnexpectedExecutionFault } from '../../runtime/execution/failures/to-unexpected-execution-fault.js';
import { assertJsonPayloadWithinLimit } from '../../runtime/execution/payload/assert-json-payload-limit.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ResolvedRevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import {
  PreparedScriptBindingSchema,
  ScriptBindingInputSchema,
} from '../contracts/script-attempt-schemas.js';
import type {
  AttemptContext,
  PreparedScriptBinding,
  PreparedScriptResource,
  ScriptBindingInput,
} from '../contracts/script-attempt.js';
import type { ProviderCatalog } from '../providers/provider-catalog.js';

const requireExactNames = (
  actual: readonly string[],
  expected: readonly string[],
  code: 'revo.script.permission.resource' | 'revo.script.permission.credential',
  message: string,
): void => {
  if (actual.length !== expected.length || actual.some((name) => !expected.includes(name))) {
    throw new ScriptFault(code, message);
  }
};

const requireDescriptorGrant = (
  descriptor: ScriptResourceDescriptor,
  manifest: ScriptManifestV1,
  resourceName: string,
): void => {
  const missingPermission = manifest.permissions.find(
    (permission) => !descriptor.grant.permissions.includes(permission),
  );
  if (missingPermission !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.grant',
      `Resource binding ${resourceName} is missing permission ${missingPermission}.`,
    );
  }

  const missingOperation = manifest.operations.find(
    (operation) => !descriptor.grant.operations.includes(operation),
  );
  if (missingOperation !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.operation',
      `Resource binding ${resourceName} is missing operation ${missingOperation}.`,
    );
  }
};

const copyDescriptor = (descriptor: ScriptResourceDescriptor): ScriptResourceDescriptor => ({
  resourceId: descriptor.resourceId,
  kind: descriptor.kind,
  repositoryId: descriptor.repositoryId,
  providerCoordinates: structuredClone(descriptor.providerCoordinates),
  grant: {
    permissions: [...descriptor.grant.permissions],
    operations: [...descriptor.grant.operations],
  },
});

const copyCredential = (credential: CredentialDescriptor): CredentialDescriptor => ({
  alias: credential.alias,
  provider: credential.provider,
});

export class ScriptBindingPreparer {
  private readonly options: ResolvedRevoScriptsOptions;
  private readonly registry: ScriptRegistry;
  private readonly catalog: ProviderCatalog;

  constructor(
    options: ResolvedRevoScriptsOptions,
    registry: ScriptRegistry,
    catalog: ProviderCatalog,
  ) {
    this.options = options;
    this.registry = registry;
    this.catalog = catalog;
  }

  async prepare(
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<PreparedScriptBinding> {
    try {
      const normalized = await this.normalizeInput(input, context);
      const script = this.registry.resolve(normalized.script.id, normalized.script.version);
      const manifest = script.manifest;
      requireExactNames(
        Object.keys(normalized.resources),
        manifest.resources.map((resource) => resource.name),
        'revo.script.permission.resource',
        'Resource bindings do not match the script manifest.',
      );
      requireExactNames(
        Object.keys(normalized.credentials),
        manifest.credentials.map((credential) => credential.name),
        'revo.script.permission.credential',
        'Credential bindings do not match the script manifest.',
      );

      const resources = await this.prepareResources(manifest, normalized, context);
      const credentials = await this.prepareCredentials(manifest, normalized, context);
      const providers = this.providerDescriptors(manifest);

      const prepared: PreparedScriptBinding = structuredClone({
        schemaVersion: 'prepared-script-binding/v1' as const,
        script: { ...normalized.script },
        definitionDigest: script.definitionDigest,
        implementation: { ...script.implementation },
        providers,
        resources,
        credentials,
        attemptPolicy: {
          timeoutMs: manifest.timeout.wallClockMs,
          terminationGraceMs: 1_000,
          retry: { ...manifest.retry, backoffMs: [...manifest.retry.backoffMs] },
          idempotency: manifest.idempotency,
        },
      });
      assertJsonPayloadWithinLimit(prepared, 'bindings');
      const restored = await PreparedScriptBindingSchema.validate(prepared);
      if (!restored.ok) {
        throw new ScriptFault(
          'revo.script.validation.binding',
          'Prepared script binding is invalid.',
        );
      }
      return prepared;
    } catch (error: unknown) {
      throw toUnexpectedExecutionFault(error, 'Script binding could not be prepared.');
    }
  }

  private async normalizeInput(
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<ScriptBindingInput> {
    let validated;
    try {
      assertJsonPayloadWithinLimit(input, 'bindings');
      validated = await ScriptBindingInputSchema.validate(input);
    } catch (error: unknown) {
      throw toUnexpectedExecutionFault(error, 'Script binding input could not be validated.');
    }
    if (!validated.ok || !isAbortSignal(context.signal)) {
      throw new ScriptFault('revo.script.validation.binding', 'Script binding input is invalid.');
    }
    const normalized = structuredClone(validated.value);
    if (!isScriptBindingInput(normalized)) {
      throw new ScriptFault('revo.script.validation.binding', 'Script binding input is invalid.');
    }
    return normalized;
  }

  private async prepareResources(
    manifest: ScriptManifestV1,
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<Readonly<Record<string, PreparedScriptResource>>> {
    const entries = await Promise.all(
      manifest.resources.map(async (requirement) => {
        const binding = input.resources[requirement.name];
        if (binding === undefined) {
          throw new ScriptFault(
            'revo.script.permission.resource',
            `Resource binding ${requirement.name} does not match the script manifest.`,
          );
        }

        const descriptor = await this.options.host.resources.inspect(binding.resourceRef, context);
        if (descriptor?.kind !== requirement.kind) {
          throw new ScriptFault(
            'revo.script.permission.resource',
            `Resource binding ${requirement.name} does not match the script manifest.`,
          );
        }
        requireDescriptorGrant(descriptor, manifest, requirement.name);
        const workspaceRequired = manifest.providers.some(
          (provider) =>
            provider.resource === requirement.name &&
            this.catalog.describe(provider).workspace === 'required',
        );
        if (workspaceRequired && binding.workspaceRef === undefined) {
          throw new ScriptFault(
            'revo.script.provider.workspace_required',
            'Provider requires a workspace binding.',
          );
        }
        await this.catalog.validateCoordinates(
          manifest.providers.filter((provider) => provider.resource === requirement.name),
          descriptor,
          requirement.name,
        );

        if (binding.workspaceRef !== undefined) {
          const workspace = await this.options.host.workspaces.inspect(
            binding.workspaceRef,
            context,
          );
          if (workspace?.repositoryId !== descriptor.repositoryId) {
            throw new ScriptFault(
              'revo.script.provider.workspace_mismatch',
              'Resolved workspace does not match the resource binding.',
            );
          }
        }

        return [
          requirement.name,
          {
            resourceRef: binding.resourceRef,
            ...(binding.workspaceRef === undefined ? {} : { workspaceRef: binding.workspaceRef }),
            descriptor: copyDescriptor(descriptor),
            requirement: { kind: requirement.kind, access: requirement.access },
          },
        ] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  private async prepareCredentials(
    manifest: ScriptManifestV1,
    input: ScriptBindingInput,
    context: AttemptContext,
  ): Promise<Readonly<Record<string, CredentialDescriptor>>> {
    const entries = await Promise.all(
      manifest.credentials.map(async (requirement) => {
        const alias = input.credentials[requirement.name];
        if (alias === undefined) {
          throw new ScriptFault(
            'revo.script.permission.credential',
            `Credential binding ${requirement.name} does not match the manifest.`,
          );
        }
        const descriptor = await this.options.host.credentials.inspect(alias, context);
        if (descriptor?.alias !== alias || descriptor?.provider !== requirement.provider) {
          throw new ScriptFault(
            'revo.script.permission.credential',
            `Credential binding ${requirement.name} does not match the manifest.`,
          );
        }
        return [requirement.name, copyCredential(descriptor)] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  private providerDescriptors(manifest: ScriptManifestV1): readonly ScriptProviderDescriptor[] {
    return manifest.providers.map((requirement) => this.catalog.describe(requirement));
  }
}

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  'aborted' in value &&
  typeof value.aborted === 'boolean' &&
  'addEventListener' in value &&
  typeof value.addEventListener === 'function';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isScriptBindingInput = (value: unknown): value is ScriptBindingInput =>
  isRecord(value) &&
  isRecord(value.script) &&
  typeof value.script.id === 'string' &&
  value.script.id.startsWith('script:') &&
  Number.isSafeInteger(value.script.version) &&
  isRecord(value.resources) &&
  isRecord(value.credentials);
