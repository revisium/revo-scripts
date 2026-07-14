import type { ScriptRegistry } from '../core/registry/script-registry.js';
import { ScriptFault } from '../core/spec/script-errors.js';
import type { ScriptProviderRequirement } from '../core/spec/script-manifest.js';
import type {
  ScriptProviderDescriptor,
  ScriptProviderModule,
  ScriptProviderRegistration,
} from '../host/provider-module.js';
import type { ScriptPlanDescriptor, ScriptProviderPin } from './contracts.js';

export interface ProviderCatalog {
  readonly exact: ReadonlyMap<string, ScriptProviderModule>;
  readonly defaults: ReadonlyMap<string, ScriptProviderModule>;
  readonly descriptors: readonly ScriptProviderDescriptor[];
}

const providerKey = (provider: {
  readonly id: string;
  readonly contract: string;
  readonly implementationDigest: string;
}): string => `${provider.id}\u0000${provider.contract}\u0000${provider.implementationDigest}`;

const snapshotProvider = (provider: ScriptProviderModule): ScriptProviderModule => {
  const createResourceClients = provider.createResourceClients.bind(provider);

  return Object.freeze({
    id: provider.id,
    contract: provider.contract,
    implementationDigest: provider.implementationDigest,
    provenance: Object.freeze({ ...provider.provenance }),
    effects: Object.freeze([...provider.effects]),
    workspace: provider.workspace,
    ...(provider.coordinateSchema === undefined
      ? {}
      : { coordinateSchema: provider.coordinateSchema }),
    createResourceClients,
  });
};

export const createProviderCatalog = (
  registrations: readonly ScriptProviderRegistration[],
): ProviderCatalog => {
  const exact = new Map<string, ScriptProviderModule>();
  const defaults = new Map<string, ScriptProviderModule>();
  const descriptors: ScriptProviderDescriptor[] = [];

  registrations.forEach((registration) => {
    const provider = snapshotProvider(registration.module);
    const key = providerKey(provider);

    if (exact.has(key)) {
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

    exact.set(key, provider);

    if (registration.useForNewPlans) {
      if (defaults.has(provider.contract)) {
        throw new ScriptFault(
          'revo.script.provider.ambiguous_default',
          'Provider contract has more than one new-plan default.',
        );
      }

      defaults.set(provider.contract, provider);
    }

    descriptors.push(
      Object.freeze({
        id: provider.id,
        contract: provider.contract,
        implementationDigest: provider.implementationDigest,
        provenance: provider.provenance,
        effects: provider.effects,
        workspace: provider.workspace,
        useForNewPlans: registration.useForNewPlans,
      }),
    );
  });

  return Object.freeze({
    exact,
    defaults,
    descriptors: Object.freeze(descriptors),
  });
};

export const requireProviderCoverage = (
  registry: ScriptRegistry,
  catalog: ProviderCatalog,
): void => {
  registry.listManifests().forEach((manifest) => {
    const providers = manifest.providers.map((requirement) => {
      const provider = catalog.defaults.get(requirement.contract);

      if (provider === undefined) {
        throw new ScriptFault(
          'revo.script.provider.contract_missing',
          `Provider contract ${requirement.contract} has no new-plan default.`,
        );
      }

      return provider;
    });
    const ownedEffects = new Set(providers.flatMap((provider) => provider.effects));
    const missingEffect = manifest.effects.find((effect) => !ownedEffects.has(effect));

    if (missingEffect !== undefined) {
      throw new ScriptFault(
        'revo.script.provider.effect_missing',
        `No selected provider owns effect ${missingEffect}.`,
      );
    }
  });
};

const toProviderPin = (
  requirement: ScriptProviderRequirement,
  provider: ScriptProviderModule,
): ScriptProviderPin =>
  Object.freeze({
    name: requirement.name,
    resource: requirement.resource,
    id: provider.id,
    contract: provider.contract,
    implementationDigest: provider.implementationDigest,
    workspace: provider.workspace,
    provenance: provider.provenance,
  });

export const resolveForPlan = (
  registry: ScriptRegistry,
  catalog: ProviderCatalog,
  script: { readonly id: `script:${string}`; readonly version: string },
): ScriptPlanDescriptor => {
  const definition = registry.resolve(script.id, script.version);
  const providers = definition.manifest.providers.map((requirement) => {
    const provider = catalog.defaults.get(requirement.contract);

    if (provider === undefined) {
      throw new ScriptFault(
        'revo.script.provider.contract_missing',
        `Provider contract ${requirement.contract} has no new-plan default.`,
      );
    }

    return toProviderPin(requirement, provider);
  });

  return Object.freeze({
    script: Object.freeze({
      id: definition.manifest.id,
      version: definition.manifest.version,
      definitionDigest: definition.definitionDigest,
    }),
    providers: Object.freeze(providers),
    manifest: definition.manifest,
  });
};

export const requireProvider = (
  catalog: ProviderCatalog,
  requirement: ScriptProviderRequirement,
  pin: ScriptProviderPin | undefined,
): ScriptProviderModule => {
  if (
    pin === undefined ||
    pin.name !== requirement.name ||
    pin.resource !== requirement.resource ||
    pin.contract !== requirement.contract
  ) {
    throw new ScriptFault(
      'revo.script.provider.pin_mismatch',
      'Provider pin does not match the script manifest.',
    );
  }

  const provider = catalog.exact.get(providerKey(pin));

  if (
    provider === undefined ||
    provider.workspace !== pin.workspace ||
    provider.provenance.packageName !== pin.provenance.packageName ||
    provider.provenance.packageVersion !== pin.provenance.packageVersion
  ) {
    throw new ScriptFault(
      'revo.script.provider.pin_mismatch',
      'Provider pin does not match a registered implementation.',
    );
  }

  return provider;
};
