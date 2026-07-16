import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptProviderModule } from '../../host/providers/script-provider-module.js';
import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
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

      if (new Set(provider.effects).size !== provider.effects.length) {
        throw new ScriptFault(
          'revo.script.provider.invalid_definition',
          'Provider effects must be unique.',
        );
      }

      this.providers.set(provider.contract, provider);

      descriptors.push({
        id: provider.id,
        contract: provider.contract,
        implementationDigest: provider.implementationDigest,
        provenance: { ...provider.provenance },
        effects: [...provider.effects],
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
      const ownedEffects = new Set(providers.flatMap((provider) => provider.effects));
      const missingEffect = manifest.effects.find((effect) => !ownedEffects.has(effect));

      if (missingEffect !== undefined) {
        throw new ScriptFault(
          'revo.script.provider.effect_missing',
          `No selected provider owns effect ${missingEffect}.`,
        );
      }
    });
  }

  requireProvider(requirement: ScriptProviderRequirement): ScriptProviderModule {
    return this.requireContract(requirement.contract);
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
