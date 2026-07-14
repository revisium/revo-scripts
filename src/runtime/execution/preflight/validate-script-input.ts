import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { emitPreflightFailure } from '../events/emit-preflight-failure.js';
import { toFailure } from '../failures/to-script-failure.js';
import { toUnexpectedExecutionFault } from '../failures/to-unexpected-execution-fault.js';
import { assertJsonPayloadWithinLimit } from '../payload/assert-json-payload-limit.js';
import type { ScriptInputValidation } from './script-input-validation.js';

export const validateScriptInput = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
): Promise<ScriptInputValidation<I, O>> => {
  try {
    assertJsonPayloadWithinLimit(request.input, 'input');
  } catch (error: unknown) {
    return {
      ok: false,
      result: await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(
          definition,
          toUnexpectedExecutionFault(error, 'Script input preflight failed unexpectedly.'),
        ),
      ),
    };
  }

  let inputResult;
  try {
    inputResult = await deadline.race(definition.inputSchema.validate(request.input));
  } catch (error: unknown) {
    return {
      ok: false,
      result: await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(
          definition,
          toUnexpectedExecutionFault(error, 'Script input validation failed unexpectedly.'),
        ),
      ),
    };
  }

  if (!inputResult.ok) {
    return {
      ok: false,
      result: await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(
          definition,
          new ScriptFault('revo.script.validation.input', 'Script input is invalid.', {
            details: { issues: inputResult.issues },
          }),
        ),
      ),
    };
  }

  return { ok: true, value: inputResult.value };
};
