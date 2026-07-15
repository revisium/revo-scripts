import { systemClock } from '../../runtime/execution/clock/system-clock.js';
import { assertEventWithinLimit } from '../../runtime/execution/payload/assert-event-limit.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptLifecycleEvent } from '../../runtime/spec/events/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';
import { codePointLength } from '../../runtime/validation/code-point-length.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';
import type { RevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import { resolveRevoScriptsHost } from '../contracts/revo-scripts-options.js';
import { createApplicationFailure } from './create-application-failure.js';

export const emitApplicationFailure = async (
  options: RevoScriptsOptions,
  request: RevoScriptExecutionRequest,
  fault: ScriptFault,
  attempts = 0,
): Promise<ScriptExecutionResult<never>> => {
  const result = createApplicationFailure(fault, attempts);
  const executionIdLength = codePointLength(request.executionId);
  const event: ScriptLifecycleEvent = {
    name: 'revo.script.failed',
    details: {
      executionId:
        executionIdLength >= 1 && executionIdLength <= 256
          ? request.executionId
          : '[INVALID_EXECUTION_ID]',
      scriptId: request.script.id,
      scriptVersion: request.script.version,
      definitionDigest: request.script.definitionDigest,
      attempt: attempts,
      timestampMs: (resolveRevoScriptsHost(options).clock ?? systemClock).now(),
      durationMs: 0,
      error: result.error,
    },
  };

  try {
    assertEventWithinLimit(event);
    await resolveRevoScriptsHost(options).events.emit(event);
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
