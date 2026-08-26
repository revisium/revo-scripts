import type { ScriptAttemptResult } from '../../application/contracts/script-attempt.js';
import type { ScriptCustomEvent } from '../../runtime/spec/events/index.js';
import type { JsonValue } from '../../runtime/spec/json/json-value.js';

export interface ScriptContractExecution {
  readonly result: ScriptAttemptResult;
  readonly events: readonly ScriptCustomEvent[];
  readonly value?: JsonValue;
}
