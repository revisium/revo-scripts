import type { ScriptContext, ScriptDefinition } from '../../spec/definition/index.js';
import type { ScriptCustomEvent } from '../../spec/events/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { createLifecycleEvent } from '../events/create-lifecycle-event.js';
import { emitCustomEvent } from '../events/emit-custom-event.js';
import { emitScriptEvent } from '../events/emit-script-event.js';
import { emitTerminalFailure } from '../events/emit-terminal-failure.js';
import { toFailure } from '../failures/to-script-failure.js';
import { toUnexpectedExecutionFault } from '../failures/to-unexpected-execution-fault.js';
import { validateHandlerResult } from '../results/validate-handler-result.js';
import { RetryScheduler } from '../retry/retry-scheduler.js';

export class ScriptAttemptRunner<I, O, R extends ScriptResourceMap> {
  private readonly definition: ScriptDefinition<I, O, R>;
  private readonly request: ExecuteScriptRequest<R>;
  private readonly input: Readonly<I>;
  private readonly clock: ScriptClock;
  private readonly deadline: ScriptDeadline;
  private readonly startedAt: number;

  constructor(
    definition: ScriptDefinition<I, O, R>,
    request: ExecuteScriptRequest<R>,
    input: Readonly<I>,
    clock: ScriptClock,
    deadline: ScriptDeadline,
    startedAt: number,
  ) {
    this.definition = definition;
    this.request = request;
    this.input = input;
    this.clock = clock;
    this.deadline = deadline;
    this.startedAt = startedAt;
  }

  async run(attempt = 1): Promise<ScriptExecutionResult<O>> {
    try {
      const handlerResult = await this.deadline.race(
        this.definition.handler.execute(this.input, this.createContext(attempt)),
      );
      const result = await validateHandlerResult(this.definition, handlerResult, this.deadline);
      await this.emitSuccess(attempt);

      return { ok: true, value: result.value, evidence: result.evidence, attempts: attempt };
    } catch (error: unknown) {
      return this.handleFailure(error, attempt);
    }
  }

  private createContext(attempt: number): Readonly<ScriptContext<R>> {
    return {
      executionId: this.request.executionId,
      attempt,
      ...(this.request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: this.request.idempotencyKey }),
      resources: this.request.resources,
      signal: this.deadline.signal,
      emit: (event: ScriptCustomEvent) =>
        this.deadline.race(
          emitCustomEvent(this.definition.manifest, this.request.eventSink, event),
        ),
    };
  }

  private async emitSuccess(attempt: number): Promise<void> {
    await this.deadline.race(
      emitScriptEvent(
        this.request.eventSink,
        createLifecycleEvent(
          this.definition,
          this.request.executionId,
          'revo.script.succeeded',
          attempt,
          this.clock.now(),
          { durationMs: this.clock.now() - this.startedAt },
        ),
      ),
    );
  }

  private async handleFailure(error: unknown, attempt: number): Promise<ScriptExecutionResult<O>> {
    const fault = toUnexpectedExecutionFault(error, 'Script execution failed unexpectedly.');
    const failure = toFailure(this.definition, fault);
    const backoffMs = this.definition.manifest.retry.backoffMs[attempt - 1];

    if (failure.code === 'revo.script.execution.event_sink') {
      return { ok: false, error: failure, attempts: attempt };
    }

    if (failure.retryable && backoffMs !== undefined) {
      const retryResult = await new RetryScheduler(
        this.definition,
        this.request,
        this.clock,
        this.deadline,
      ).schedule({ startedAt: this.startedAt, attempt, backoffMs, failure });
      return retryResult ?? this.run(attempt + 1);
    }

    return emitTerminalFailure(
      this.definition,
      this.request,
      this.clock,
      this.deadline,
      this.startedAt,
      attempt,
      failure,
    );
  }
}
