import type { ScriptEvidence } from '../../spec/result/index.js';

export interface ValidatedHandlerResult<O> {
  readonly value: O;
  readonly evidence: readonly ScriptEvidence[];
}
