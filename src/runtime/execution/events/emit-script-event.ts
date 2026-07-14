import { ScriptFault } from '../../spec/errors/index.js';
import type { EventSink, ScriptEvent } from '../../spec/events/index.js';
import { assertEventWithinLimit } from '../payload/assert-event-limit.js';

export const emitScriptEvent = async (sink: EventSink, event: ScriptEvent): Promise<void> => {
  assertEventWithinLimit(event);

  try {
    await sink.emit(event);
  } catch (cause: unknown) {
    throw new ScriptFault(
      'revo.script.execution.event_sink',
      'Event sink rejected a script event.',
      { cause },
    );
  }
};
