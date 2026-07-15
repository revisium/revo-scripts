import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';
import { requireBinding } from './require-binding.js';
import { validateBindingBounds } from './validate-binding-bounds.js';

const requireExactNames = (
  actual: readonly string[],
  expected: readonly string[],
  fault: ScriptFault,
): void => {
  if (actual.length !== expected.length || actual.some((name) => !expected.includes(name))) {
    throw fault;
  }
};

export const validateExactBindings = (
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
): void => {
  validateBindingBounds(request);
  requireExactNames(
    Object.keys(request.bindings.resources),
    manifest.resources.map((resource) => resource.name),
    new ScriptFault(
      'revo.script.permission.resource',
      'Resource bindings do not match the script manifest.',
    ),
  );
  requireExactNames(
    Object.keys(request.bindings.credentials),
    manifest.credentials.map((credential) => credential.name),
    new ScriptFault(
      'revo.script.permission.credential',
      'Credential bindings do not match the script manifest.',
    ),
  );

  manifest.resources.forEach((requirement) => requireBinding(request, manifest, requirement));
  manifest.credentials.forEach((requirement) => {
    const binding = request.bindings.credentials[requirement.name];

    if (binding?.provider !== requirement.provider) {
      throw new ScriptFault(
        'revo.script.permission.credential',
        `Credential binding ${requirement.name} does not match the manifest.`,
      );
    }
  });
};
