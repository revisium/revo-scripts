import type { ScriptDeadline } from '../../runtime/execution/deadline/script-deadline.js';
import { assertJsonPayloadWithinLimit } from '../../runtime/execution/payload/assert-json-payload-limit.js';
import { validateIdempotencyKey } from '../../runtime/execution/validation/validate-idempotency-key.js';
import type { RegisteredScript } from '../../runtime/registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { getRegisteredDefinition } from '../../runtime/registry/get-registered-definition.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';

export const validateRequestBeforeProviders = async <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
  request: RevoScriptExecutionRequest,
  deadline: ScriptDeadline,
): Promise<I> => {
  assertJsonPayloadWithinLimit(request.input, 'input');
  assertJsonPayloadWithinLimit(request.bindings, 'bindings');
  validateIdempotencyKey(script.manifest, request.idempotencyKey);

  const definition = getRegisteredDefinition(registry, script);
  const input = await deadline.race(definition.inputSchema.validate(request.input));

  if (!input.ok) {
    throw new ScriptFault('revo.script.validation.input', 'Script input is invalid.', {
      details: { issues: input.issues },
    });
  }

  return input.value;
};
