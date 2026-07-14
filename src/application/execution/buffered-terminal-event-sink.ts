import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { EventSink, ScriptEvent } from '../../runtime/spec/events/index.js';

const isTerminalEvent = (event: ScriptEvent): boolean =>
  event.name === 'revo.script.succeeded' || event.name === 'revo.script.failed';

export class BufferedTerminalEventSink implements EventSink {
  private readonly target: EventSink;
  private terminalEvent: ScriptEvent | undefined;

  constructor(target: EventSink) {
    this.target = target;
  }

  async emit(event: ScriptEvent): Promise<void> {
    if (isTerminalEvent(event)) {
      if (this.terminalEvent !== undefined) {
        throw new ScriptFault(
          'revo.script.execution.event_sink',
          'Script execution produced more than one terminal event.',
        );
      }

      this.terminalEvent = event;
      return;
    }

    await this.target.emit(event);
  }

  discard(): void {
    this.terminalEvent = undefined;
  }

  async flush(): Promise<void> {
    if (this.terminalEvent === undefined) {
      return;
    }

    const event = this.terminalEvent;
    this.terminalEvent = undefined;
    await this.target.emit(event);
  }
}
