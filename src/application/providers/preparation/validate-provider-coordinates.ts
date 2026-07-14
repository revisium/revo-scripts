import type { ScriptResourceBinding } from '../../../host/bindings/script-resource-binding.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { ValidatedProvider } from './validated-provider.js';

/* eslint-disable no-await-in-loop -- Owner: revo-scripts maintainers; schema faults must follow manifest provider order; remove when the contract defines deterministic parallel validation. */

const sameNames = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((name) => expected.includes(name));

const requireCoordinateNames = (
  resourceName: string,
  binding: ScriptResourceBinding,
  providers: readonly ValidatedProvider[],
): void => {
  const expectedNames = providers
    .filter((provider) => provider.provider.coordinateSchema !== undefined)
    .map((provider) => provider.requirement.name);
  const actualNames = Object.keys(binding.providerCoordinates);

  if (sameNames(actualNames, expectedNames)) {
    return;
  }

  const noCoordinatesAreSupported = expectedNames.length === 0 && actualNames.length > 0;
  throw new ScriptFault(
    noCoordinatesAreSupported
      ? 'revo.script.provider.coordinates_unsupported'
      : 'revo.script.provider.coordinates_invalid',
    noCoordinatesAreSupported
      ? 'Provider coordinates are not supported by the selected implementations.'
      : `Provider coordinate keys for resource ${resourceName} do not match the selected implementations.`,
  );
};

const validateProviderCoordinate = async (
  provider: ValidatedProvider,
  binding: ScriptResourceBinding,
): Promise<void> => {
  const schema = provider.provider.coordinateSchema;

  if (schema === undefined) {
    return;
  }

  const name = provider.requirement.name;
  const coordinates = binding.providerCoordinates[name];
  let validation;

  try {
    validation = await schema.validate(coordinates);
  } catch (cause: unknown) {
    throw new ScriptFault(
      'revo.script.provider.coordinates_invalid',
      `Provider coordinates for ${name} are invalid.`,
      { cause },
    );
  }

  if (!validation.ok) {
    throw new ScriptFault(
      'revo.script.provider.coordinates_invalid',
      `Provider coordinates for ${name} are invalid.`,
      { details: { issues: validation.issues } },
    );
  }
};

const validateResourceCoordinates = async (
  resourceName: string,
  providers: readonly ValidatedProvider[],
): Promise<void> => {
  const binding = providers[0]?.binding;

  if (binding === undefined) {
    throw new ScriptFault(
      'revo.script.provider.coordinates_invalid',
      `Provider coordinates for resource ${resourceName} cannot be validated.`,
    );
  }

  requireCoordinateNames(resourceName, binding, providers);

  for (const provider of providers) {
    await validateProviderCoordinate(provider, binding);
  }
};

export const validateProviderCoordinates = async (
  providers: readonly ValidatedProvider[],
): Promise<void> => {
  const resourceNames = new Set(providers.map((provider) => provider.requirement.resource));

  for (const resourceName of resourceNames) {
    const resourceProviders = providers.filter(
      (provider) => provider.requirement.resource === resourceName,
    );
    await validateResourceCoordinates(resourceName, resourceProviders);
  }
};
