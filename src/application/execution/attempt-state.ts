import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type {
  AttemptCancellationResult,
  ScriptAttemptRef,
  ScriptAttemptUncertainResult,
  ScriptTerminalAttemptResult,
  ScriptReconciliationResult,
} from '../contracts/script-attempt.js';

// A structured tuple cannot collide when identifiers contain separator-like
// characters. Public schema validation bounds those identifiers before state.
const keyFor = (input: ScriptAttemptRef): string =>
  JSON.stringify([input.executionId, input.attemptId]);
const retainedTerminalAttempts = 1_024;
const retainedOpenAttempts = 1_024;

export class AttemptState {
  private readonly active = new Map<string, AbortController>();
  private readonly terminal = new Map<string, ScriptTerminalAttemptResult>();
  private readonly uncertain = new Map<string, ScriptAttemptUncertainResult>();
  private readonly terminalOrder: string[] = [];

  begin(input: ScriptAttemptRef, controller: AbortController): void {
    const key = keyFor(input);
    if (this.active.has(key) || this.terminal.has(key)) {
      throw new ScriptFault(
        'revo.script.validation.attempt',
        'Script attempt identity has already been accepted.',
      );
    }
    if (this.active.size >= retainedOpenAttempts) {
      throw new ScriptFault(
        'revo.script.execution.capacity',
        'Script attempt capacity has been reached.',
        { retryable: true },
      );
    }
    this.active.set(key, controller);
  }

  finish(input: ScriptAttemptRef, result: ScriptTerminalAttemptResult): void {
    const key = keyFor(input);
    this.active.delete(key);
    this.uncertain.delete(key);
    this.terminal.set(key, result);
    this.terminalOrder.push(key);
    if (this.terminalOrder.length > retainedTerminalAttempts) {
      const evicted = this.terminalOrder.shift();
      if (evicted !== undefined) {
        this.terminal.delete(evicted);
      }
    }
  }

  markUncertain(input: ScriptAttemptRef, result: ScriptAttemptUncertainResult): void {
    this.uncertain.set(keyFor(input), result);
  }

  cancel(input: ScriptAttemptRef): AttemptCancellationResult {
    const key = keyFor(input);
    const terminal = this.terminal.get(key);
    if (terminal !== undefined) {
      return { kind: 'alreadyTerminal', result: terminal };
    }
    const uncertain = this.uncertain.get(key);
    if (uncertain !== undefined) {
      return { kind: 'uncertain', result: uncertain };
    }
    const controller = this.active.get(key);
    if (controller !== undefined) {
      controller.abort();
      return { kind: 'unknown' };
    }
    // This process has no durable dispatch ledger. An absent local record may
    // mean a prior process submitted the external work, so it is not proof of
    // `notFound`.
    return { kind: 'unknown' };
  }

  reconcile(input: ScriptAttemptRef): ScriptReconciliationResult {
    const key = keyFor(input);
    const terminal = this.terminal.get(key);
    if (terminal !== undefined) {
      return { kind: 'terminal', result: terminal };
    }
    const uncertain = this.uncertain.get(key);
    if (uncertain !== undefined) {
      return { kind: 'uncertain', result: uncertain };
    }
    // See cancel(): loss of process-local state must stay conservative.
    return { kind: 'unknown' };
  }
}
