import type { EventSink } from './script-events.js';
import type { ScriptResourceMap } from './script-resources.js';

export interface ScriptClock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export interface ExecuteScriptRequest<R extends ScriptResourceMap> {
  readonly executionId: string;
  readonly input: unknown;
  readonly resources: R;
  readonly idempotencyKey?: string;
  readonly eventSink: EventSink;
  readonly clock?: ScriptClock;
  readonly signal?: AbortSignal;
}
