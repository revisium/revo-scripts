import type { ScriptContractExecution } from './script-contract-execution.js';

export interface ScriptContractHarness {
  runAttempt(input: unknown): Promise<ScriptContractExecution>;
}
