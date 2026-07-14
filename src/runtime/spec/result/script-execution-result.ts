import type { ScriptEvidence } from './script-evidence.js';
import type { ScriptFailure } from './script-failure.js';

export type ScriptExecutionResult<O> =
  | Readonly<{
      ok: true;
      value: O;
      evidence: readonly ScriptEvidence[];
      attempts: number;
    }>
  | Readonly<{
      ok: false;
      error: ScriptFailure;
      attempts: number;
    }>;
