import { createScriptRegistry } from '../../../src/core/registry/script-registry.js';
import { executeScript } from '../../../src/core/runtime/execute-script.js';
import type { ScriptDefinition } from '../../../src/core/spec/script-definition.js';
import type { EventSink, ScriptEvent } from '../../../src/core/spec/script-events.js';
import type { ScriptClock } from '../../../src/core/spec/script-execution.js';
import type { ScriptResourceMap } from '../../../src/core/spec/script-resources.js';
import type { ScriptExecutionResult } from '../../../src/core/spec/script-result.js';

export const createRecordingEventSink = (): {
  readonly events: ScriptEvent[];
  readonly sink: EventSink;
} => {
  const events: ScriptEvent[] = [];
  const sink: EventSink = {
    emit: async (event) => {
      events.push(structuredClone(event));
    },
  };

  return { events, sink };
};

export const fixedClock = {
  now: () => 1_000,
  sleep: async () => {},
};

export const registerTestScript = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
) => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();

  return { registry, script };
};

export interface RuntimeScenarioRequest<R extends ScriptResourceMap> {
  readonly executionId: string;
  readonly input: unknown;
  readonly resources: R;
  readonly clock?: ScriptClock;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface RuntimeScenarioResult<O> {
  readonly result: ScriptExecutionResult<O>;
  readonly events: readonly ScriptEvent[];
}

export const executeRuntimeScenario = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: RuntimeScenarioRequest<R>,
): Promise<RuntimeScenarioResult<O>> => {
  const { registry, script } = registerTestScript(definition);
  const { events, sink } = createRecordingEventSink();
  const result = await executeScript(registry, script, {
    executionId: request.executionId,
    input: request.input,
    resources: request.resources,
    eventSink: sink,
    clock: request.clock ?? fixedClock,
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });

  return { result, events };
};
