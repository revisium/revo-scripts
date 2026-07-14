import type { EventSink } from '../events/event-sink.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptClock } from './script-clock.js';

export interface ExecuteScriptRequest<R extends ScriptResourceMap> {
  readonly executionId: string;
  readonly input: unknown;
  readonly resources: R;
  readonly idempotencyKey?: string;
  readonly eventSink: EventSink;
  readonly clock?: ScriptClock;
  readonly signal?: AbortSignal;
}
