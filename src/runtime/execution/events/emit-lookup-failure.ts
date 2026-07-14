import type { RegisteredScript } from '../../registry/contracts/registered-script.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { toSafeFailure } from '../failures/to-safe-failure.js';
import { createLifecycleEvent } from './create-lifecycle-event.js';
import { emitScriptEvent } from './emit-script-event.js';

export const emitLookupFailure = async <I, O, R extends ScriptResourceMap>(
  script: RegisteredScript<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
  fault: ScriptFault,
  executionId = request.executionId,
): Promise<ScriptExecutionResult<O>> => {
  const failure = toSafeFailure(fault);

  try {
    await deadline.race(
      emitScriptEvent(
        request.eventSink,
        createLifecycleEvent(script, executionId, 'revo.script.failed', 0, clock.now(), {
          durationMs: 0,
          error: failure,
        }),
      ),
    );
  } catch (error: unknown) {
    const emittedFailure =
      error instanceof ScriptFault
        ? toSafeFailure(error)
        : toSafeFailure(
            new ScriptFault(
              'revo.script.execution.event_sink',
              'Event sink rejected a script event.',
              { cause: error },
            ),
          );
    return { ok: false, error: emittedFailure, attempts: 0 };
  }

  return { ok: false, error: failure, attempts: 0 };
};
