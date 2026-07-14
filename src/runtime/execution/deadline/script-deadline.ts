import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptClock } from '../../spec/execution/index.js';

export class ScriptDeadline {
  readonly signal: AbortSignal;
  private readonly clock: ScriptClock;
  private readonly externalSignal: AbortSignal | undefined;
  private readonly controller = new AbortController();
  private readonly expiresAt: number;
  private readonly deadline: Promise<never>;
  private readonly timeout: ReturnType<typeof setTimeout>;
  private readonly rejectDeadline: (reason: ScriptFault) => void;
  private settled = false;

  private constructor(
    timeoutMs: number,
    clock: ScriptClock,
    deadline: Promise<never>,
    rejectDeadline: (reason: ScriptFault) => void,
    externalSignal?: AbortSignal,
  ) {
    this.clock = clock;
    this.externalSignal = externalSignal;
    this.signal = this.controller.signal;
    this.expiresAt = clock.now() + timeoutMs;
    this.deadline = deadline;
    this.rejectDeadline = rejectDeadline;
    this.timeout = setTimeout(() => {
      this.fail(
        new ScriptFault('revo.script.timeout.deadline', 'Script wall-clock deadline expired.'),
      );
    }, timeoutMs);

    if (externalSignal?.aborted === true) {
      this.abortFromCaller();
    } else {
      externalSignal?.addEventListener('abort', this.abortFromCaller, { once: true });
    }
  }

  static create(
    timeoutMs: number,
    clock: ScriptClock,
    externalSignal?: AbortSignal,
  ): ScriptDeadline {
    let rejectDeadline: (reason: ScriptFault) => void = () => {};
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
    });
    // Preflight may return before a race consumes an already-aborted deadline.
    void deadline.catch(() => undefined);

    return new ScriptDeadline(timeoutMs, clock, deadline, rejectDeadline, externalSignal);
  }

  remainingMs(): number {
    return Math.max(0, this.expiresAt - this.clock.now());
  }

  race<T>(operation: Promise<T>): Promise<T> {
    return Promise.race([operation, this.deadline]);
  }

  dispose(): void {
    this.settled = true;
    clearTimeout(this.timeout);
    this.externalSignal?.removeEventListener('abort', this.abortFromCaller);
  }

  private readonly abortFromCaller = (): void => {
    if (this.externalSignal?.reason instanceof ScriptFault) {
      this.fail(this.externalSignal.reason);
      return;
    }

    this.fail(
      new ScriptFault('revo.script.execution.aborted', 'Script execution was aborted.', {
        cause: this.externalSignal?.reason,
      }),
    );
  };

  private fail(fault: ScriptFault): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.controller.abort(fault);
    this.rejectDeadline(fault);
  }
}
