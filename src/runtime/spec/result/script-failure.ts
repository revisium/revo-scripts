import type { ScriptErrorCode } from '../errors/script-error-code.js';

export interface ScriptFailure {
  readonly code: ScriptErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}
