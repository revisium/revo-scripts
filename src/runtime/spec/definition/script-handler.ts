import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptHandlerResult } from '../result/script-handler-result.js';
import type { ScriptContext } from './script-context.js';

export interface ScriptHandler<I, O, R extends ScriptResourceMap> {
  execute(input: Readonly<I>, context: Readonly<ScriptContext<R>>): Promise<ScriptHandlerResult<O>>;
}
