import type { ScriptClock } from '../../spec/execution/index.js';
import { ScriptDeadline } from './script-deadline.js';

export const createScriptDeadline = (
  timeoutMs: number,
  clock: ScriptClock,
  externalSignal?: AbortSignal,
): ScriptDeadline => ScriptDeadline.create(timeoutMs, clock, externalSignal);
