import { ScriptFault } from '../../runtime/spec/errors/index.js';

export const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) {
    return;
  }

  if (signal.reason instanceof ScriptFault) {
    throw signal.reason;
  }

  throw new ScriptFault('revo.script.execution.aborted', 'Script execution was aborted.', {
    cause: signal.reason,
  });
};
