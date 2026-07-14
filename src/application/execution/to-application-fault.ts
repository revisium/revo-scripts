import { ScriptFault } from '../../runtime/spec/errors/index.js';

export const toApplicationFault = (error: unknown, message: string): ScriptFault =>
  error instanceof ScriptFault
    ? error
    : new ScriptFault('revo.script.execution.unexpected', message, { cause: error });
