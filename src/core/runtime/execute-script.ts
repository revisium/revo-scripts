import {
  getRegisteredDefinition,
  type RegisteredScript,
  type ScriptRegistry,
} from '../registry/script-registry.js';
import type { ScriptContext, ScriptDefinition } from '../spec/script-definition.js';
import { ScriptFault } from '../spec/script-errors.js';
import type { ScriptCustomEvent, ScriptLifecycleEvent } from '../spec/script-events.js';
import type { ScriptClock, ExecuteScriptRequest } from '../spec/script-execution.js';
import type { ScriptManifestV1 } from '../spec/script-manifest.js';
import type { ScriptResourceMap } from '../spec/script-resources.js';
import type { ScriptExecutionResult, ScriptFailure } from '../spec/script-result.js';
import { createScriptDeadline, type ScriptDeadline } from './deadline.js';
import { emitCustomEvent, emitScriptEvent } from './event-policy.js';
import {
  assertEventWithinLimit,
  assertJsonPayloadWithinLimit,
  validateEvidence,
} from './payload-limits.js';
import { redactValue } from './redact.js';
import { validateExecutionId, validateExecutionRequest } from './validate-execution.js';

const defaultClock: ScriptClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      const complete = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const timeout = setTimeout(complete, ms);
      const abort = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };

      if (signal.aborted) {
        abort();
        return;
      }

      signal.addEventListener('abort', abort, { once: true });
    }),
};

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach((nested) => deepFreeze(nested));
  return Object.freeze(value);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface ScriptExecutionIdentity {
  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
}

const redactFailureDetails = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  try {
    const redacted = redactValue(details, definition.manifest.redaction.errorPaths);
    const projected = isRecord(redacted) ? redacted : { value: redacted };
    assertEventWithinLimit({ details: projected });
    return projected;
  } catch {
    return { redacted: '[INVALID_OR_OVERSIZED_DETAILS]' };
  }
};

const toFailure = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  fault: ScriptFault,
): ScriptFailure => {
  const retryable =
    fault.code === 'revo.script.provider.transient' &&
    fault.retryable &&
    definition.manifest.retry.mode === 'transient';

  if (fault.details === undefined) {
    return Object.freeze({
      code: fault.code,
      message: fault.message,
      retryable,
    });
  }

  return Object.freeze({
    code: fault.code,
    message: fault.message,
    retryable,
    details: redactFailureDetails(definition, fault.details),
  });
};

const createLifecycleEvent = (
  definition: ScriptExecutionIdentity,
  executionId: string,
  name: ScriptLifecycleEvent['name'],
  attempt: number,
  timestampMs: number,
  additionalDetails?: Readonly<Record<string, unknown>>,
): ScriptLifecycleEvent => ({
  name,
  details: {
    executionId,
    scriptId: definition.manifest.id,
    scriptVersion: definition.manifest.version,
    definitionDigest: definition.definitionDigest,
    attempt,
    timestampMs,
    ...additionalDetails,
  },
});

const toSafeFailure = (fault: ScriptFault): ScriptFailure =>
  Object.freeze({
    code: fault.code,
    message: fault.message,
    retryable: false,
  });

const emitLookupFailure = async <I, O, R extends ScriptResourceMap>(
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
    return Object.freeze({
      ok: false,
      error: emittedFailure,
      attempts: 0,
    });
  }

  return Object.freeze({ ok: false, error: failure, attempts: 0 });
};

const createContext = <R extends ScriptResourceMap>(
  request: ExecuteScriptRequest<R>,
  manifest: ScriptManifestV1,
  attempt: number,
  deadline: ScriptDeadline,
): Readonly<ScriptContext<R>> =>
  Object.freeze({
    executionId: request.executionId,
    attempt,
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    resources: Object.freeze(request.resources),
    signal: deadline.signal,
    emit: (event: ScriptCustomEvent) =>
      deadline.race(emitCustomEvent(manifest, request.eventSink, event)),
  });

const emitPreflightFailure = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
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
          0,
          clock.now(),
          {
            durationMs: 0,
            error: failure,
          },
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
    return Object.freeze({
      ok: false,
      error: toFailure(definition, sinkFault),
      attempts: 0,
    });
  }

  return Object.freeze({ ok: false, error: failure, attempts: 0 });
};

const emitTerminalFailure = async <I, O, R extends ScriptResourceMap>(
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
          { durationMs: clock.now() - startedAt, error: failure },
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
    return Object.freeze({
      ok: false,
      error: toFailure(definition, sinkFault),
      attempts: attempt,
    });
  }

  return Object.freeze({ ok: false, error: failure, attempts: attempt });
};

const toUnexpectedExecutionFault = (error: unknown, message: string): ScriptFault =>
  error instanceof ScriptFault
    ? error
    : new ScriptFault('revo.script.execution.unexpected', message, { cause: error });

const runAttempt = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  input: Readonly<I>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
  startedAt: number,
  attempt: number,
): Promise<ScriptExecutionResult<O>> => {
  try {
    const handlerResult = await deadline.race(
      definition.handler(input, createContext(request, definition.manifest, attempt, deadline)),
    );
    const result = await deadline.race(definition.resultSchema.validate(handlerResult.value));

    if (!result.ok) {
      throw new ScriptFault('revo.script.validation.result', 'Script result is invalid.', {
        details: { issues: result.issues },
      });
    }

    assertJsonPayloadWithinLimit(result.value, 'result');
    const evidence = Object.freeze([...(handlerResult.evidence ?? [])]);
    validateEvidence(evidence);

    await deadline.race(
      emitScriptEvent(
        request.eventSink,
        createLifecycleEvent(
          definition,
          request.executionId,
          'revo.script.succeeded',
          attempt,
          clock.now(),
          { durationMs: clock.now() - startedAt },
        ),
      ),
    );

    return Object.freeze({
      ok: true,
      value: result.value,
      evidence,
      attempts: attempt,
    });
  } catch (error: unknown) {
    const fault = toUnexpectedExecutionFault(error, 'Script execution failed unexpectedly.');
    const failure = toFailure(definition, fault);
    const backoffMs = definition.manifest.retry.backoffMs[attempt - 1];
    const canRetry = failure.retryable && backoffMs !== undefined;

    if (failure.code === 'revo.script.execution.event_sink') {
      return Object.freeze({ ok: false, error: failure, attempts: attempt });
    }

    if (canRetry) {
      if (backoffMs >= deadline.remainingMs()) {
        const deadlineFailure = toFailure(
          definition,
          new ScriptFault(
            'revo.script.timeout.deadline',
            'Script wall-clock deadline expired before the next retry.',
          ),
        );
        return emitTerminalFailure(
          definition,
          request,
          clock,
          deadline,
          startedAt,
          attempt,
          deadlineFailure,
        );
      }

      try {
        await deadline.race(
          emitScriptEvent(
            request.eventSink,
            createLifecycleEvent(
              definition,
              request.executionId,
              'revo.script.retrying',
              attempt,
              clock.now(),
              { nextAttempt: attempt + 1, backoffMs, error: failure },
            ),
          ),
        );
        await deadline.race(clock.sleep(backoffMs, deadline.signal));
      } catch (retryError: unknown) {
        const retryFault = toUnexpectedExecutionFault(
          retryError,
          'Script retry scheduling failed unexpectedly.',
        );
        const retryFailure = toFailure(definition, retryFault);

        if (retryFailure.code === 'revo.script.execution.event_sink') {
          return Object.freeze({ ok: false, error: retryFailure, attempts: attempt });
        }

        return emitTerminalFailure(
          definition,
          request,
          clock,
          deadline,
          startedAt,
          attempt,
          retryFailure,
        );
      }

      return runAttempt(definition, request, input, clock, deadline, startedAt, attempt + 1);
    }

    return emitTerminalFailure(definition, request, clock, deadline, startedAt, attempt, failure);
  }
};

export const executeScript = async <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
  request: ExecuteScriptRequest<R>,
): Promise<ScriptExecutionResult<O>> => {
  const clock = request.clock ?? defaultClock;
  const startedAt = clock.now();
  const deadline = createScriptDeadline(script.manifest.timeout.wallClockMs, clock, request.signal);
  try {
    try {
      validateExecutionId(request.executionId);
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(
        error,
        'Script execution identity validation failed unexpectedly.',
      );
      return await emitLookupFailure(
        script,
        request,
        clock,
        deadline,
        fault,
        '[INVALID_EXECUTION_ID]',
      );
    }

    let definition: ScriptDefinition<I, O, R>;
    try {
      definition = getRegisteredDefinition(registry, script);
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(
        error,
        'Script definition lookup failed unexpectedly.',
      );
      return await emitLookupFailure(script, request, clock, deadline, fault);
    }

    try {
      assertJsonPayloadWithinLimit(request.input, 'input');
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(
        error,
        'Script input preflight failed unexpectedly.',
      );
      return await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(definition, fault),
      );
    }

    let inputResult;
    try {
      inputResult = await deadline.race(definition.inputSchema.validate(request.input));
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(
        error,
        'Script input validation failed unexpectedly.',
      );
      return await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(definition, fault),
      );
    }

    if (!inputResult.ok) {
      const failure = toFailure(
        definition,
        new ScriptFault('revo.script.validation.input', 'Script input is invalid.', {
          details: { issues: inputResult.issues },
        }),
      );
      return await emitPreflightFailure(definition, request, clock, deadline, failure);
    }

    try {
      validateExecutionRequest(definition.manifest, request);
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(error, 'Script preflight failed unexpectedly.');
      return await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(definition, fault),
      );
    }

    let input: Readonly<I>;
    try {
      input = deepFreeze(inputResult.value);
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(
        error,
        'Script validated input could not be made immutable.',
      );
      return await emitPreflightFailure(
        definition,
        request,
        clock,
        deadline,
        toFailure(definition, fault),
      );
    }

    const attempt = 1;
    try {
      await deadline.race(
        emitScriptEvent(
          request.eventSink,
          createLifecycleEvent(
            definition,
            request.executionId,
            'revo.script.started',
            attempt,
            clock.now(),
          ),
        ),
      );
    } catch (error: unknown) {
      const fault =
        error instanceof ScriptFault
          ? error
          : new ScriptFault(
              'revo.script.execution.event_sink',
              'Event sink rejected a script event.',
              { cause: error },
            );
      return Object.freeze({
        ok: false,
        error: toFailure(definition, fault),
        attempts: 0,
      });
    }

    return await runAttempt(definition, request, input, clock, deadline, startedAt, attempt);
  } finally {
    deadline.dispose();
  }
};
