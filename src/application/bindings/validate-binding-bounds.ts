import { serializeScriptJson } from '../../runtime/execution/payload/serialize-script-json.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';

export const validateBindingBounds = (request: RevoScriptExecutionRequest): void => {
  const resourceBindings = Object.values(request.bindings.resources);

  if (resourceBindings.length > 16 || Object.keys(request.bindings.credentials).length > 16) {
    throw new ScriptFault(
      'revo.script.validation.bindings',
      'Execution bindings exceed the supported collection limits.',
    );
  }

  resourceBindings.forEach((binding) => {
    if (binding.grant.permissions.length > 64 || binding.grant.effects.length > 16) {
      throw new ScriptFault(
        'revo.script.validation.bindings',
        'A resource grant exceeds the supported collection limits.',
      );
    }

    if (
      new Set(binding.grant.permissions).size !== binding.grant.permissions.length ||
      new Set(binding.grant.effects).size !== binding.grant.effects.length
    ) {
      throw new ScriptFault(
        'revo.script.validation.bindings',
        'Resource grant permissions and effects must be unique.',
      );
    }

    const coordinateCount = Object.keys(binding.providerCoordinates).length;
    const coordinateBytes = Buffer.byteLength(
      serializeScriptJson(binding.providerCoordinates, 'bindings'),
      'utf8',
    );

    if (coordinateCount > 8 || coordinateBytes > 16_384) {
      throw new ScriptFault(
        'revo.script.provider.coordinates_invalid',
        'Provider coordinates exceed the supported collection or payload limits.',
      );
    }
  });
};
