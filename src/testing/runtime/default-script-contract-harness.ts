import { executeScript } from '../../runtime/execution/execute-script.js';
import type { RegisteredScript } from '../../runtime/registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { createScriptRegistry } from '../../runtime/registry/create-script-registry.js';
import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import { DeterministicScriptClock } from './deterministic-script-clock.js';
import { RecordingEventSink } from './recording-event-sink.js';
import type { ScriptContractExecution } from './script-contract-execution.js';
import type { ScriptContractHarnessOptions } from './script-contract-harness-options.js';
import type { ScriptContractHarness } from './script-contract-harness.js';

export class DefaultScriptContractHarness<
  I,
  O,
  R extends ScriptResourceMap,
> implements ScriptContractHarness<O> {
  private readonly registry: ScriptRegistry;
  private readonly script: RegisteredScript<I, O, R>;
  private readonly options: ScriptContractHarnessOptions<R>;

  constructor(definition: ScriptDefinition<I, O, R>, options: ScriptContractHarnessOptions<R>) {
    this.registry = createScriptRegistry();
    this.script = this.registry.register(definition);
    this.registry.seal();
    this.options = options;
  }

  async execute(input: unknown): Promise<ScriptContractExecution<O>> {
    const eventSink = new RecordingEventSink();
    const clock = new DeterministicScriptClock(this.options.nowMs ?? 0);
    const result = await executeScript(this.registry, this.script, {
      executionId: this.options.executionId ?? 'script-contract-execution',
      input,
      resources: this.options.resources,
      eventSink,
      clock,
      ...(this.options.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: this.options.idempotencyKey }),
    });

    return {
      result,
      events: eventSink.read(),
      sleeps: clock.readSleeps(),
    };
  }
}
