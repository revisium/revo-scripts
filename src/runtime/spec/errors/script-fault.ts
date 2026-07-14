import type { ScriptErrorCode } from './script-error-code.js';

export class ScriptFault extends Error {
  readonly code: ScriptErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ScriptErrorCode,
    message: string,
    options?: Readonly<{
      retryable?: boolean;
      details?: Readonly<Record<string, unknown>>;
      cause?: unknown;
    }>,
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ScriptFault';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}
