import type { ScriptEvent } from '../../runtime/spec/events/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';

export interface ScriptContractExecution<O> {
  readonly result: ScriptExecutionResult<O>;
  readonly events: readonly ScriptEvent[];
  readonly sleeps: readonly number[];
}
