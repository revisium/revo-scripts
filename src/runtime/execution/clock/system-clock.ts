import type { ScriptClock } from '../../spec/execution/index.js';

const clock: ScriptClock = {
  now: () => Date.now(),
  sleep: (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const complete = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const timeout = setTimeout(complete, ms);
      const abort = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };

      if (signal.aborted) {
        abort();
        return;
      }

      signal.addEventListener('abort', abort, { once: true });
    }),
};

export const systemClock: ScriptClock = clock;
