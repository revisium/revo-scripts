import type { RegisteredScript } from '../../registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../../registry/contracts/script-registry.js';
import { getRegisteredDefinition } from '../../registry/get-registered-definition.js';
import type { ScriptDefinition } from '../../spec/definition/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { emitLookupFailure } from '../events/emit-lookup-failure.js';
import { toUnexpectedExecutionFault } from '../failures/to-unexpected-execution-fault.js';

export const resolveScriptDefinition = async <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
): Promise<ScriptDefinition<I, O, R> | ScriptExecutionResult<O>> => {
  try {
    return getRegisteredDefinition(registry, script);
  } catch (error: unknown) {
    return emitLookupFailure(
      script,
      request,
      clock,
      deadline,
      toUnexpectedExecutionFault(error, 'Script definition lookup failed unexpectedly.'),
    );
  }
};
