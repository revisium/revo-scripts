import type { ScriptEvidence } from './script-evidence.js';

export interface ScriptHandlerResult<O> {
  readonly value: O;
  readonly evidence?: readonly ScriptEvidence[];
}
