import type { GitStatusCapability, GitStatusSnapshot } from '../git/status.js';
import { executeScript } from '../runtime/execute-script.js';
import { createScriptRegistry } from '../runtime/registry.js';
import type { ScriptDefinition } from '../spec/script-definition.js';
import type { EventSink, ScriptEvent } from '../spec/script-events.js';
import type { ScriptClock } from '../spec/script-execution.js';
import type { ScriptResourceMap } from '../spec/script-resources.js';
import type { ScriptExecutionResult } from '../spec/script-result.js';

export class RecordingEventSink implements EventSink {
  readonly #events: ScriptEvent[] = [];

  async emit(event: ScriptEvent): Promise<void> {
    this.#events.push(structuredClone(event));
  }

  read(): readonly ScriptEvent[] {
    return Object.freeze(structuredClone(this.#events));
  }
}

export class DeterministicScriptClock implements ScriptClock {
  #nowMs: number;
  readonly #sleeps: number[] = [];

  constructor(nowMs: number) {
    this.#nowMs = nowMs;
  }

  now(): number {
    return this.#nowMs;
  }

  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason;
    }

    this.#sleeps.push(ms);
    this.#nowMs += ms;
  }

  readSleeps(): readonly number[] {
    return Object.freeze([...this.#sleeps]);
  }
}

export interface ScriptContractHarnessOptions<R extends ScriptResourceMap> {
  readonly resources: R;
  readonly executionId?: string;
  readonly idempotencyKey?: string;
  readonly nowMs?: number;
}

export interface ScriptContractExecution<O> {
  readonly result: ScriptExecutionResult<O>;
  readonly events: readonly ScriptEvent[];
  readonly sleeps: readonly number[];
}

export interface ScriptContractHarness<O> {
  execute(input: unknown): Promise<ScriptContractExecution<O>>;
}

export const createScriptContractHarness = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  options: ScriptContractHarnessOptions<R>,
): ScriptContractHarness<O> => {
  const registry = createScriptRegistry();
  const script = registry.register(definition);
  registry.seal();

  return Object.freeze({
    execute: async (input: unknown) => {
      const eventSink = new RecordingEventSink();
      const clock = new DeterministicScriptClock(options.nowMs ?? 0);
      const result = await executeScript(registry, script, {
        executionId: options.executionId ?? 'script-contract-execution',
        input,
        resources: options.resources,
        eventSink,
        clock,
        ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      });

      return Object.freeze({
        result,
        events: eventSink.read(),
        sleeps: clock.readSleeps(),
      });
    },
  });
};

export interface GitStatusCapabilityFake {
  readonly capability: GitStatusCapability;
  callCount(): number;
}

export const createGitStatusCapabilityFake = (
  snapshot: GitStatusSnapshot,
): GitStatusCapabilityFake => {
  let calls = 0;
  const capability: GitStatusCapability = Object.freeze({
    readStatus: async (signal: AbortSignal) => {
      if (signal.aborted) {
        throw signal.reason;
      }

      calls += 1;
      return structuredClone(snapshot);
    },
  });

  return Object.freeze({
    capability,
    callCount: () => calls,
  });
};
