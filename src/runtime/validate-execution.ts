import { ScriptFault } from '../spec/script-errors.js';
import type { ExecuteScriptRequest } from '../spec/script-execution.js';
import type { ScriptManifestV1, ScriptResourceRequirement } from '../spec/script-manifest.js';
import type { ScriptResourceHandle, ScriptResourceMap } from '../spec/script-resources.js';
import { codePointLength } from './validation-rules.js';

export const validateExecutionId = (executionId: string): void => {
  if (codePointLength(executionId) === 0 || codePointLength(executionId) > 256) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Execution id must contain between 1 and 256 Unicode code points.',
    );
  }
};

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

const validateResourceGrant = (
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

const validateResources = (manifest: ScriptManifestV1, resources: ScriptResourceMap): void => {
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
    validateResourceGrant(manifest, resource);
  });
};

const validateIdempotency = (
  manifest: ScriptManifestV1,
  idempotencyKey: string | undefined,
): void => {
  if (manifest.idempotency === 'required' && idempotencyKey === undefined) {
    throw new ScriptFault(
      'revo.script.idempotency.key_required',
      'This script requires an idempotency key.',
    );
  }

  if (
    idempotencyKey !== undefined &&
    (codePointLength(idempotencyKey) === 0 || codePointLength(idempotencyKey) > 1_024)
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Idempotency key must contain between 1 and 1024 Unicode code points.',
    );
  }
};

export const validateExecutionRequest = <R extends ScriptResourceMap>(
  manifest: ScriptManifestV1,
  request: ExecuteScriptRequest<R>,
): void => {
  validateResources(manifest, request.resources);
  validateIdempotency(manifest, request.idempotencyKey);
};
