import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptManifestV1, ScriptResourceRequirement } from '../../spec/manifest/index.js';
import type { ScriptResourceHandle, ScriptResourceMap } from '../../spec/resources/index.js';

const requireResource = (
  resources: ScriptResourceMap,
  requirement: ScriptResourceRequirement,
): ScriptResourceHandle<object> => {
  const resource = resources[requirement.name];

  if (resource === undefined) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Prepared resource ${requirement.name} is missing.`,
      { details: { resource: requirement.name } },
    );
  }

  if (
    resource.name !== requirement.name ||
    resource.kind !== requirement.kind ||
    resource.access !== requirement.access
  ) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Prepared resource ${requirement.name} does not match its manifest requirement.`,
      { details: { resource: requirement.name } },
    );
  }

  return resource;
};

const validateGrant = (
  manifest: ScriptManifestV1,
  resource: ScriptResourceHandle<object>,
): void => {
  const missingPermission = manifest.permissions.find(
    (permission) => !resource.grant.permissions.includes(permission),
  );

  if (missingPermission !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.grant',
      `Prepared resource grant is missing permission ${missingPermission}.`,
      { details: { permission: missingPermission, resource: resource.name } },
    );
  }

  const missingEffect = manifest.effects.find((effect) => !resource.grant.effects.includes(effect));

  if (missingEffect !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.effect',
      `Prepared resource grant is missing effect ${missingEffect}.`,
      { details: { effect: missingEffect, resource: resource.name } },
    );
  }
};

export const validateResources = (
  manifest: ScriptManifestV1,
  resources: ScriptResourceMap,
): void => {
  const declaredNames = new Set(manifest.resources.map((resource) => resource.name));
  const extraResource = Object.keys(resources).find((name) => !declaredNames.has(name));

  if (extraResource !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Prepared resource ${extraResource} is not declared by the script manifest.`,
      { details: { resource: extraResource } },
    );
  }

  manifest.resources.forEach((requirement) => {
    const resource = requireResource(resources, requirement);
    validateGrant(manifest, resource);
  });
};
