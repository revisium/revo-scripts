import type { ScriptDefinition } from '../../spec/definition/index.js';
import type { ExecuteScriptRequest, ScriptClock } from '../../spec/execution/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptExecutionResult, ScriptFailure } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { emitFailure } from './emit-failure.js';

export const emitPreflightFailure = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  request: ExecuteScriptRequest<R>,
  clock: ScriptClock,
  deadline: ScriptDeadline,
  failure: ScriptFailure,
): Promise<ScriptExecutionResult<O>> =>
  emitFailure(definition, request, clock, deadline, 0, 0, failure);
