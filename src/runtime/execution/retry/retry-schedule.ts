import type { ScriptFailure } from '../../spec/result/index.js';

export interface RetrySchedule {
  readonly startedAt: number;
  readonly attempt: number;
  readonly backoffMs: number;
  readonly failure: ScriptFailure;
}
