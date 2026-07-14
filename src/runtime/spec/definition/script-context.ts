import type { ScriptCustomEvent } from '../events/script-custom-event.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';

export interface ScriptContext<R extends ScriptResourceMap> {
  readonly executionId: string;
  readonly attempt: number;
  readonly idempotencyKey?: string;
  readonly resources: R;
  readonly signal: AbortSignal;
  readonly emit: (event: ScriptCustomEvent) => Promise<void>;
}
