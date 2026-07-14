import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import { DefaultScriptContractHarness } from './default-script-contract-harness.js';
import type { ScriptContractHarnessOptions } from './script-contract-harness-options.js';
import type { ScriptContractHarness } from './script-contract-harness.js';

export const createScriptContractHarness = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  options: ScriptContractHarnessOptions<R>,
): ScriptContractHarness<O> => new DefaultScriptContractHarness(definition, options);
