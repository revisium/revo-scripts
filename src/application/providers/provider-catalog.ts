import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptProviderModule } from '../../host/providers/script-provider-module.js';
import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import type { ScriptResourceDescriptor } from '../../host/resources/resource-resolver.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptProviderRequirement } from '../../runtime/spec/manifest/index.js';

export class ProviderCatalog {
  private readonly providers = new Map<string, ScriptProviderModule>();
  readonly descriptors: readonly ScriptProviderDescriptor[];

  constructor(registrations: readonly ScriptProviderRegistration[]) {
    const descriptors: ScriptProviderDescriptor[] = [];

    registrations.forEach((registration) => {
      const provider = registration.module;
      if (this.providers.has(provider.contract)) {
        throw new ScriptFault(
          'revo.script.provider.duplicate',
          'Provider contract is registered more than once.',
        );
      }

      if (new Set(provider.operations).size !== provider.operations.length) {
        throw new ScriptFault(
          'revo.script.provider.invalid_definition',
          'Provider operations must be unique.',
        );
      }

      this.providers.set(provider.contract, provider);

      descriptors.push({
        id: provider.id,
        contract: provider.contract,
        implementationDigest: provider.implementationDigest,
        provenance: { ...provider.provenance },
        operations: [...provider.operations],
        workspace: provider.workspace,
      });
    });

    this.descriptors = descriptors;
  }

  requireCoverage(registry: ScriptRegistry): void {
    registry.listManifests().forEach((manifest) => {
      const providers = manifest.providers.map((requirement) =>
        this.requireContract(requirement.contract),
      );
      const ownedOperations = new Set(providers.flatMap((provider) => provider.operations));
      const missingOperation = manifest.operations.find(
        (operation) => !ownedOperations.has(operation),
      );

      if (missingOperation !== undefined) {
        throw new ScriptFault(
          'revo.script.provider.operation_missing',
          `No selected provider owns operation ${missingOperation}.`,
        );
      }
    });
  }

  requireProvider(requirement: ScriptProviderRequirement): ScriptProviderModule {
    return this.requireContract(requirement.contract);
  }

  describe(requirement: ScriptProviderRequirement): ScriptProviderDescriptor {
    const provider = this.requireProvider(requirement);
    return {
      id: provider.id,
      contract: provider.contract,
      implementationDigest: provider.implementationDigest,
      provenance: { ...provider.provenance },
      operations: [...provider.operations],
      workspace: provider.workspace,
    };
  }

  async validateCoordinates(
    requirements: readonly ScriptProviderRequirement[],
    descriptor: ScriptResourceDescriptor,
    resourceName: string,
  ): Promise<void> {
    const coordinateProviders = requirements.filter(
      (requirement) => this.requireProvider(requirement).coordinateSchema !== undefined,
    );
    // A provider without a coordinate schema owns its private coordinates. The
    // catalog cannot safely reject or reinterpret them; concrete providers
    // validate their own shape at client creation.
    if (coordinateProviders.length === 0) {
      return;
    }
    const expected = coordinateProviders.map((requirement) => requirement.name);
    const actual = Object.keys(descriptor.providerCoordinates);
    if (actual.length !== expected.length || actual.some((name) => !expected.includes(name))) {
      throw new ScriptFault(
        'revo.script.provider.coordinates_invalid',
        `Provider coordinate keys for resource ${resourceName} do not match the selected implementations.`,
      );
    }

    for (const requirement of coordinateProviders) {
      const schema = this.requireProvider(requirement).coordinateSchema;
      if (schema === undefined) {
        continue;
      }
      let validation;
      try {
        // eslint-disable-next-line no-await-in-loop -- preserve manifest order for deterministic diagnostics.
        validation = await schema.validate(descriptor.providerCoordinates[requirement.name]);
      } catch (error: unknown) {
        throw new ScriptFault(
          'revo.script.provider.coordinates_invalid',
          `Provider coordinates for ${requirement.name} are invalid.`,
          { cause: error },
        );
      }
      if (!validation.ok) {
        throw new ScriptFault(
          'revo.script.provider.coordinates_invalid',
          `Provider coordinates for ${requirement.name} are invalid.`,
        );
      }
    }
  }

  private requireContract(contract: string): ScriptProviderModule {
    const provider = this.providers.get(contract);

    if (provider === undefined) {
      throw new ScriptFault(
        'revo.script.provider.contract_missing',
        `Provider contract ${contract} is not registered.`,
      );
    }

    return provider;
  }
}
