import type { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptFailure } from '../../spec/result/index.js';

export const toSafeFailure = (fault: ScriptFault): ScriptFailure => ({
  code: fault.code,
  message: fault.message,
  retryable: false,
});
