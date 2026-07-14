import type { ScriptFailure } from '../../runtime/spec/result/index.js';

export interface ApplicationFailure {
  readonly ok: false;
  readonly error: ScriptFailure;
  readonly attempts: number;
}
