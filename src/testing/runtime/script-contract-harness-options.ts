import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';

export interface ScriptContractHarnessOptions<R extends ScriptResourceMap> {
  readonly resources: R;
  readonly executionId?: string;
  readonly idempotencyKey?: string;
  readonly nowMs?: number;
}
