import type { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ApplicationFailure } from './application-failure.js';

export const createApplicationFailure = (fault: ScriptFault, attempts = 0): ApplicationFailure => ({
  ok: false,
  error: {
    code: fault.code,
    message: fault.message,
    retryable: false,
  },
  attempts,
});
