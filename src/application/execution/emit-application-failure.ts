import { systemClock } from '../../runtime/execution/clock/system-clock.js';
import { assertEventWithinLimit } from '../../runtime/execution/payload/assert-event-limit.js';
import { isValidExecutionId } from '../../runtime/execution/validation/validate-execution-id.js';
import type { RegisteredScript } from '../../runtime/registry/contracts/registered-script.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptLifecycleEvent } from '../../runtime/spec/events/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';
import type { ResolvedRevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import { createApplicationFailure } from './create-application-failure.js';

export const emitApplicationFailure = async (
  options: ResolvedRevoScriptsOptions,
  request: RevoScriptExecutionRequest,
  fault: ScriptFault,
  script?: RegisteredScript<unknown, unknown, ScriptResourceMap>,
  attempts = 0,
): Promise<ScriptExecutionResult<never>> => {
  const result = createApplicationFailure(fault, attempts);
  const event: ScriptLifecycleEvent = {
    name: 'revo.script.failed',
    details: {
      executionId: isValidExecutionId(request.executionId)
        ? request.executionId
        : '[INVALID_EXECUTION_ID]',
      scriptId: request.script.id,
      scriptVersion: request.script.version,
      ...(script === undefined ? {} : { definitionDigest: script.definitionDigest }),
      attempt: attempts,
      timestampMs: (options.host.clock ?? systemClock).now(),
      durationMs: 0,
      error: result.error,
    },
  };

  try {
    assertEventWithinLimit(event);
    await options.host.events.emit(event);
  } catch (error: unknown) {
    return createApplicationFailure(
      new ScriptFault('revo.script.execution.event_sink', 'Event sink rejected a script event.', {
        cause: error,
      }),
      attempts,
    );
  }

  return result;
};
