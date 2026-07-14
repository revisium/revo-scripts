import type { RegisteredScript } from '../registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../registry/contracts/script-registry.js';
import type { ExecuteScriptRequest } from '../spec/execution/index.js';
import type { ScriptResourceMap } from '../spec/resources/index.js';
import type { ScriptExecutionResult } from '../spec/result/index.js';
import { ScriptExecution } from './script-execution.js';

export const executeValidatedScript = async <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
  request: ExecuteScriptRequest<R>,
  input: I,
): Promise<ScriptExecutionResult<O>> =>
  new ScriptExecution(registry, script, request).execute({ ok: true, value: input });
