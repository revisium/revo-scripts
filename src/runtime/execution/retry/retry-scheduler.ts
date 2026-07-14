import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { createLifecycleEvent } from '../events/create-lifecycle-event.js';
import { emitScriptEvent } from '../events/emit-script-event.js';
import { emitTerminalFailure } from '../events/emit-terminal-failure.js';
import { toFailure } from '../failures/to-script-failure.js';
import { toUnexpectedExecutionFault } from '../failures/to-unexpected-execution-fault.js';
import type { RetrySchedule } from './retry-schedule.js';

export class RetryScheduler<I, O, R extends ScriptResourceMap> {
  private readonly definition: ScriptDefinition<I, O, R>;
  private readonly request: ExecuteScriptRequest<R>;
  private readonly clock: ScriptClock;
  private readonly deadline: ScriptDeadline;

  constructor(
    definition: ScriptDefinition<I, O, R>,
    request: ExecuteScriptRequest<R>,
    clock: ScriptClock,
    deadline: ScriptDeadline,
  ) {
    this.definition = definition;
    this.request = request;
    this.clock = clock;
    this.deadline = deadline;
  }

  async schedule(schedule: RetrySchedule): Promise<ScriptExecutionResult<O> | undefined> {
    const { startedAt, attempt, backoffMs, failure } = schedule;

    if (backoffMs >= this.deadline.remainingMs()) {
      const deadlineFailure = toFailure(
        this.definition,
        new ScriptFault(
          'revo.script.timeout.deadline',
          'Script wall-clock deadline expired before the next retry.',
        ),
      );
      return emitTerminalFailure(
        this.definition,
        this.request,
        this.clock,
        this.deadline,
        startedAt,
        attempt,
        deadlineFailure,
      );
    }

    try {
      await this.deadline.race(
        emitScriptEvent(
          this.request.eventSink,
          createLifecycleEvent(
            this.definition,
            this.request.executionId,
            'revo.script.retrying',
            attempt,
            this.clock.now(),
            { nextAttempt: attempt + 1, backoffMs, error: failure },
          ),
        ),
      );
      await this.deadline.race(this.clock.sleep(backoffMs, this.deadline.signal));
      return undefined;
    } catch (error: unknown) {
      const retryFailure = toFailure(
        this.definition,
        toUnexpectedExecutionFault(error, 'Script retry scheduling failed unexpectedly.'),
      );

      if (retryFailure.code === 'revo.script.execution.event_sink') {
        return { ok: false, error: retryFailure, attempts: attempt };
      }

      return emitTerminalFailure(
        this.definition,
        this.request,
        this.clock,
        this.deadline,
        startedAt,
        attempt,
        retryFailure,
      );
    }
  }
}
