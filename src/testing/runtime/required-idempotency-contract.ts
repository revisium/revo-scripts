import { isDeepStrictEqual } from 'node:util';

import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ScriptContractExecution } from './script-contract-execution.js';

export interface RequiredIdempotencyScenario<O> {
  readonly scriptId: string;
  /** Executes a whole script invocation with the same key after its previous host result was lost. */
  readonly execute: () => Promise<ScriptContractExecution<O>>;
  /** The stable typed result that a host receives after the effect succeeds but its first result is lost. */
  readonly adoptedResult: ScriptContractExecution<O>['result'];
  /** Counts only provider mutation effects, not reconciliation reads or script executions. */
  readonly mutationCount: () => number;
}

export const verifyCrashReconciliation = async <O>(
  scenario: RequiredIdempotencyScenario<O>,
): Promise<void> => {
  await scenario.execute();
  const adopted = await scenario.execute();
  if (!isDeepStrictEqual(adopted.result, scenario.adoptedResult)) {
    throw new Error(
      `Crash reconciliation did not adopt an equal typed result for ${scenario.scriptId}.`,
    );
  }
  if (scenario.mutationCount() !== 1) {
    throw new Error(
      `Crash reconciliation duplicated or skipped the mutation for ${scenario.scriptId}.`,
    );
  }
};

/**
 * Runs exactly one crash-reconciliation scenario for every registered write that declares
 * `idempotency: required`. New definitions are discovered from their manifest, so a newly
 * registered required write cannot silently bypass this contract.
 */
export const verifyRequiredIdempotencyContracts = async (
  definitions: readonly ScriptDefinition<unknown, unknown, ScriptResourceMap>[],
  scenarios: readonly RequiredIdempotencyScenario<unknown>[],
): Promise<void> => {
  const required = definitions
    .filter((definition) => definition.manifest.idempotency === 'required')
    .map((definition): string => definition.manifest.id)
    .sort();
  const byScript = new Map<string, RequiredIdempotencyScenario<unknown>>();
  for (const scenario of scenarios) {
    if (byScript.has(scenario.scriptId)) {
      throw new Error(`Duplicate required-idempotency scenario for ${scenario.scriptId}.`);
    }
    byScript.set(scenario.scriptId, scenario);
  }
  const missing = required.filter((id) => !byScript.has(id));
  const unexpected = [...byScript.keys()].filter((id) => !required.includes(id)).sort();
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Required-idempotency scenarios must match registered writes; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }
  const verifications: Promise<void>[] = [];
  for (const id of required) {
    const scenario = byScript.get(id);
    if (scenario === undefined) {
      throw new Error(`Required-idempotency scenario missing for ${id}.`);
    }
    verifications.push(verifyCrashReconciliation(scenario));
  }
  await Promise.all(verifications);
};
