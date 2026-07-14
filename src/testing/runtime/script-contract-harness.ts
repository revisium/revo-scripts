import type { ScriptContractExecution } from './script-contract-execution.js';

export interface ScriptContractHarness<O> {
  execute(input: unknown): Promise<ScriptContractExecution<O>>;
}
