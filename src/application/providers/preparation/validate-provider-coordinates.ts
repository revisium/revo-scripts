import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { ValidatedProvider } from './validated-provider.js';

/* eslint-disable no-await-in-loop -- Owner: revo-scripts maintainers; schema faults must follow manifest provider order; remove when the contract defines deterministic parallel validation. */

const sameNames = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((name) => expected.includes(name));

export const validateProviderCoordinates = async (
  providers: readonly ValidatedProvider[],
): Promise<void> => {
  const resourceNames = new Set(providers.map((provider) => provider.requirement.resource));

  for (const resourceName of resourceNames) {
    const resourceProviders = providers.filter(
      (provider) => provider.requirement.resource === resourceName,
    );
    const expectedNames = resourceProviders
      .filter((provider) => provider.provider.coordinateSchema !== undefined)
      .map((provider) => provider.requirement.name);
    const binding = resourceProviders[0]?.binding;

    if (binding === undefined) {
      throw new ScriptFault(
        'revo.script.provider.coordinates_invalid',
        `Provider coordinates for resource ${resourceName} cannot be validated.`,
      );
    }

    const actualNames = Object.keys(binding.providerCoordinates);

    if (!sameNames(actualNames, expectedNames)) {
      const noCoordinatesAreSupported = expectedNames.length === 0 && actualNames.length > 0;
      throw new ScriptFault(
        noCoordinatesAreSupported
          ? 'revo.script.provider.coordinates_unsupported'
          : 'revo.script.provider.coordinates_invalid',
        noCoordinatesAreSupported
          ? 'Provider coordinates are not supported by the selected implementations.'
          : `Provider coordinate keys for resource ${resourceName} do not match the selected implementations.`,
      );
    }

    for (const provider of resourceProviders) {
      const schema = provider.provider.coordinateSchema;

      if (schema === undefined) {
        continue;
      }

      const coordinates = binding.providerCoordinates[provider.requirement.name];
      let validation;

      try {
        validation = await schema.validate(coordinates);
      } catch (cause: unknown) {
        throw new ScriptFault(
          'revo.script.provider.coordinates_invalid',
          `Provider coordinates for ${provider.requirement.name} are invalid.`,
          { cause },
        );
      }

      if (!validation.ok) {
        throw new ScriptFault(
          'revo.script.provider.coordinates_invalid',
          `Provider coordinates for ${provider.requirement.name} are invalid.`,
          { details: { issues: validation.issues } },
        );
      }
    }
  }
};
