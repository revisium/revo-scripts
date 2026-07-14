import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult, ScriptFailure } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { toFailure } from '../failures/to-script-failure.js';
import { createLifecycleEvent } from './create-lifecycle-event.js';
import { emitScriptEvent } from './emit-script-event.js';

export const emitFailure = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
  startedAt: number,
  attempt: number,
  failure: ScriptFailure,
): Promise<ScriptExecutionResult<O>> => {
  try {
    await deadline.race(
      emitScriptEvent(
        request.eventSink,
        createLifecycleEvent(
          definition,
          request.executionId,
          'revo.script.failed',
          attempt,
          clock.now(),
          { durationMs: attempt === 0 ? 0 : clock.now() - startedAt, error: failure },
        ),
      ),
    );
  } catch (error: unknown) {
    const sinkFault =
      error instanceof ScriptFault
        ? error
        : new ScriptFault(
            'revo.script.execution.event_sink',
            'Event sink rejected a script event.',
            { cause: error },
          );
    return { ok: false, error: toFailure(definition, sinkFault), attempts: attempt };
  }

  return { ok: false, error: failure, attempts: attempt };
};
