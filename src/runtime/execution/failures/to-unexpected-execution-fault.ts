import { ScriptFault } from '../../spec/errors/index.js';

export const toUnexpectedExecutionFault = (error: unknown, message: string): ScriptFault =>
  error instanceof ScriptFault
    ? error
    : new ScriptFault('revo.script.execution.unexpected', message, { cause: error });
