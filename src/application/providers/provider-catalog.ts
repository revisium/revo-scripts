import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptProviderModule } from '../../host/providers/script-provider-module.js';
import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptProviderRequirement } from '../../runtime/spec/manifest/index.js';
import type { ScriptPlanDescriptor } from '../contracts/script-plan-descriptor.js';
import type { ScriptProviderPin } from '../contracts/script-provider-pin.js';
import { providerKey } from './provider-key.js';
import { toProviderPin } from './to-provider-pin.js';

export class ProviderCatalog {
  private readonly exact = new Map<string, ScriptProviderModule>();
  private readonly defaults = new Map<string, ScriptProviderModule>();
  readonly descriptors: readonly ScriptProviderDescriptor[];

  constructor(registrations: readonly ScriptProviderRegistration[]) {
    const descriptors: ScriptProviderDescriptor[] = [];

    registrations.forEach((registration) => {
      const provider = registration.module;
      const key = providerKey(provider);

      if (this.exact.has(key)) {
        throw new ScriptFault(
          'revo.script.provider.duplicate',
          'Provider implementation is registered more than once.',
        );
      }

      if (new Set(provider.effects).size !== provider.effects.length) {
        throw new ScriptFault(
          'revo.script.provider.invalid_definition',
          'Provider effects must be unique.',
        );
      }

      this.exact.set(key, provider);

      if (registration.useForNewPlans) {
        if (this.defaults.has(provider.contract)) {
          throw new ScriptFault(
            'revo.script.provider.ambiguous_default',
            'Provider contract has more than one new-plan default.',
          );
        }

        this.defaults.set(provider.contract, provider);
      }

      descriptors.push({
        id: provider.id,
        contract: provider.contract,
        implementationDigest: provider.implementationDigest,
        provenance: { ...provider.provenance },
        effects: [...provider.effects],
        workspace: provider.workspace,
        useForNewPlans: registration.useForNewPlans,
      });
    });

    this.descriptors = descriptors;
  }

  requireCoverage(registry: ScriptRegistry): void {
    registry.listManifests().forEach((manifest) => {
      const providers = manifest.providers.map((requirement) =>
        this.requireDefault(requirement.contract),
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

  resolveForPlan(
    registry: ScriptRegistry,
    script: { readonly id: `script:${string}`; readonly version: string },
  ): ScriptPlanDescriptor {
    const definition = registry.resolve(script.id, script.version);
    const providers = definition.manifest.providers.map((requirement) =>
      toProviderPin(requirement, this.requireDefault(requirement.contract)),
    );

    return {
      script: {
        id: definition.manifest.id,
        version: definition.manifest.version,
        definitionDigest: definition.definitionDigest,
      },
      providers,
      manifest: definition.manifest,
    };
  }

  requireProvider(
    requirement: ScriptProviderRequirement,
    pin: ScriptProviderPin | undefined,
  ): ScriptProviderModule {
    if (
      pin?.name !== requirement.name ||
      pin.resource !== requirement.resource ||
      pin.contract !== requirement.contract
    ) {
      throw new ScriptFault(
        'revo.script.provider.pin_mismatch',
        'Provider pin does not match the script manifest.',
      );
    }

    const provider = this.exact.get(providerKey(pin));

    if (
      provider?.workspace !== pin.workspace ||
      provider.provenance.packageName !== pin.provenance.packageName ||
      provider.provenance.packageVersion !== pin.provenance.packageVersion
    ) {
      throw new ScriptFault(
        'revo.script.provider.pin_mismatch',
        'Provider pin does not match a registered implementation.',
      );
    }

    return provider;
  }

  private requireDefault(contract: string): ScriptProviderModule {
    const provider = this.defaults.get(contract);

    if (provider === undefined) {
      throw new ScriptFault(
        'revo.script.provider.contract_missing',
        `Provider contract ${contract} has no new-plan default.`,
      );
    }

    return provider;
  }
}
