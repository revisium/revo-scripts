import { ScriptFault } from '../spec/script-errors.js';
import type { ScriptClock } from '../spec/script-execution.js';

export interface ScriptDeadline {
  readonly signal: AbortSignal;
  remainingMs(): number;
  race<T>(operation: Promise<T>): Promise<T>;
  dispose(): void;
}

export const createScriptDeadline = (
  timeoutMs: number,
  clock: ScriptClock,
  externalSignal?: AbortSignal,
): ScriptDeadline => {
  const controller = new AbortController();
  const expiresAt = clock.now() + timeoutMs;
  let rejectDeadline: (reason: ScriptFault) => void = () => {};
  let settled = false;

  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  // Preflight may return before a race consumes an already-aborted deadline.
  void deadline.catch(() => undefined);

  const fail = (fault: ScriptFault) => {
    if (settled) {
      return;
    }

    settled = true;
    controller.abort(fault);
    rejectDeadline(fault);
  };

  const timeout = setTimeout(
    () =>
      fail(new ScriptFault('revo.script.timeout.deadline', 'Script wall-clock deadline expired.')),
    timeoutMs,
  );
  const abortFromCaller = () => {
    if (externalSignal?.reason instanceof ScriptFault) {
      fail(externalSignal.reason);
      return;
    }

    fail(
      new ScriptFault('revo.script.execution.aborted', 'Script execution was aborted.', {
        cause: externalSignal?.reason,
      }),
    );
  };

  if (externalSignal?.aborted === true) {
    abortFromCaller();
  } else {
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  return Object.freeze({
    signal: controller.signal,
    remainingMs: () => Math.max(0, expiresAt - clock.now()),
    race: <T>(operation: Promise<T>) => Promise.race([operation, deadline]),
    dispose: () => {
      settled = true;
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    },
  });
};
