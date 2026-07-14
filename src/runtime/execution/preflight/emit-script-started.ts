import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { createLifecycleEvent } from '../events/create-lifecycle-event.js';
import { emitScriptEvent } from '../events/emit-script-event.js';
import { toFailure } from '../failures/to-script-failure.js';

export const emitScriptStarted = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
): Promise<ScriptExecutionResult<O> | undefined> => {
  try {
    await deadline.race(
      emitScriptEvent(
        request.eventSink,
        createLifecycleEvent(
          definition,
          request.executionId,
          'revo.script.started',
          1,
          clock.now(),
        ),
      ),
    );
    return undefined;
  } catch (error: unknown) {
    const fault =
      error instanceof ScriptFault
        ? error
        : new ScriptFault(
            'revo.script.execution.event_sink',
            'Event sink rejected a script event.',
            { cause: error },
          );
    return { ok: false, error: toFailure(definition, fault), attempts: 0 };
  }
};
