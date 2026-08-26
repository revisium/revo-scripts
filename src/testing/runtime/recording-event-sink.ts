import type {
  EventSink,
  ScriptLiveEventEmission,
} from '../../application/contracts/script-attempt.js';

export class RecordingEventSink implements EventSink {
  private readonly events: ScriptLiveEventEmission[] = [];

  async emit(emission: ScriptLiveEventEmission): Promise<void> {
    this.events.push(structuredClone(emission));
  }

  read(): readonly ScriptLiveEventEmission[] {
    return structuredClone(this.events);
  }
}
