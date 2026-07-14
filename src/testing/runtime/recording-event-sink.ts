import type { EventSink, ScriptEvent } from '../../runtime/spec/events/index.js';

export class RecordingEventSink implements EventSink {
  private readonly events: ScriptEvent[] = [];

  async emit(event: ScriptEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  read(): readonly ScriptEvent[] {
    return structuredClone(this.events);
  }
}
