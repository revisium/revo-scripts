import type { RegisteredScript } from '../registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../registry/contracts/script-registry.js';
import type { ExecuteScriptRequest } from '../spec/execution/index.js';
import type { ScriptResourceMap } from '../spec/resources/index.js';
import type { ScriptExecutionResult } from '../spec/result/index.js';
import { ScriptAttemptRunner } from './attempts/script-attempt-runner.js';
import { systemClock } from './clock/system-clock.js';
import { createScriptDeadline } from './deadline/create-script-deadline.js';
import { emitLookupFailure } from './events/emit-lookup-failure.js';
import { emitPreflightFailure } from './events/emit-preflight-failure.js';
import { toFailure } from './failures/to-script-failure.js';
import { toUnexpectedExecutionFault } from './failures/to-unexpected-execution-fault.js';
import { emitScriptStarted } from './preflight/emit-script-started.js';
import { resolveScriptDefinition } from './preflight/resolve-script-definition.js';
import { validateScriptInput } from './preflight/validate-script-input.js';
import { validateExecutionId } from './validation/validate-execution-id.js';
import { validateExecutionRequest } from './validation/validate-execution-request.js';

export class ScriptExecution<I, O, R extends ScriptResourceMap> {
  private readonly registry: ScriptRegistry;
  private readonly script: RegisteredScript<I, O, R>;
  private readonly request: ExecuteScriptRequest<R>;

  constructor(
    registry: ScriptRegistry,
    script: RegisteredScript<I, O, R>,
    request: ExecuteScriptRequest<R>,
  ) {
    this.registry = registry;
    this.script = script;
    this.request = request;
  }

  async execute(
    validatedInput?: Readonly<{ ok: true; value: I }>,
  ): Promise<ScriptExecutionResult<O>> {
    const clock = this.request.clock ?? systemClock;
    const startedAt = clock.now();
    const deadline = createScriptDeadline(
      this.script.manifest.timeout.wallClockMs,
      clock,
      this.request.signal,
    );

    try {
      try {
        validateExecutionId(this.request.executionId);
      } catch (error: unknown) {
        return await emitLookupFailure(
          this.script,
          this.request,
          clock,
          deadline,
          toUnexpectedExecutionFault(
            error,
            'Script execution identity validation failed unexpectedly.',
          ),
          '[INVALID_EXECUTION_ID]',
        );
      }

      const definition = await resolveScriptDefinition(
        this.registry,
        this.script,
        this.request,
        clock,
        deadline,
      );

      if (!('handler' in definition)) {
        return definition;
      }

      const input =
        validatedInput ?? (await validateScriptInput(definition, this.request, clock, deadline));

      if (!input.ok) {
        return input.result;
      }

      try {
        validateExecutionRequest(definition.manifest, this.request);
      } catch (error: unknown) {
        return await emitPreflightFailure(
          definition,
          this.request,
          clock,
          deadline,
          toFailure(
            definition,
            toUnexpectedExecutionFault(error, 'Script preflight failed unexpectedly.'),
          ),
        );
      }

      const started = await emitScriptStarted(definition, this.request, clock, deadline);

      if (started !== undefined) {
        return started;
      }

      return await new ScriptAttemptRunner(
        definition,
        this.request,
        input.value,
        clock,
        deadline,
        startedAt,
      ).run();
    } finally {
      deadline.dispose();
    }
  }
}
