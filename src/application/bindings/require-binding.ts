import type { ScriptResourceBinding } from '../../host/bindings/script-resource-binding.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type {
  ScriptManifestV1,
  ScriptResourceRequirement,
} from '../../runtime/spec/manifest/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';

export const requireBinding = (
  request: RevoScriptExecutionRequest,
  manifest: ScriptManifestV1,
  requirement: ScriptResourceRequirement,
): ScriptResourceBinding => {
  const binding = request.bindings.resources[requirement.name];

  if (binding?.kind !== requirement.kind || binding.access !== requirement.access) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Resource binding ${requirement.name} does not match the manifest.`,
    );
  }

  const missingPermission = manifest.permissions.find(
    (permission) => !binding.grant.permissions.includes(permission),
  );

  if (missingPermission !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.grant',
      `Resource binding ${requirement.name} is missing permission ${missingPermission}.`,
    );
  }

  const missingEffect = manifest.effects.find((effect) => !binding.grant.effects.includes(effect));

  if (missingEffect !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.effect',
      `Resource binding ${requirement.name} is missing effect ${missingEffect}.`,
    );
  }

  return binding;
};
