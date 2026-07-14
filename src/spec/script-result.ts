export interface ScriptEvidence {
  readonly kind: 'artifact' | 'log' | 'external';
  readonly ref: string;
  readonly summary?: string;
}

export interface ScriptHandlerResult<O> {
  readonly value: O;
  readonly evidence?: readonly ScriptEvidence[];
}

import type { ScriptErrorCode } from './script-errors.js';

export interface ScriptFailure {
  readonly code: ScriptErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

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
