import type { ScriptEvent } from './script-event.js';

export interface EventSink {
  emit(event: ScriptEvent): Promise<void>;
}
