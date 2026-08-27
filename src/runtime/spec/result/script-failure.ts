import type { ScriptErrorCode } from '../errors/script-error-code.js';
import type { JsonObject } from '../json/json-value.js';

export type ScriptFailureStage =
  | 'acquire'
  | 'handler'
  | 'provider'
  | 'timeout'
  | 'cleanup'
  | 'event_sink'
  | 'invariant';

export type ScriptFailureCause =
  | Readonly<{ kind: 'fault'; code: ScriptErrorCode; stage: ScriptFailureStage }>
  | Readonly<{
      kind: 'prior_outcome';
      outcome: 'succeeded' | 'failed' | 'cancelled' | 'timedOut';
    }>;

export interface ScriptFailure {
  readonly code: ScriptErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly stage: ScriptFailureStage;
  readonly details: JsonObject | null;
  readonly causes: readonly ScriptFailureCause[];
}
