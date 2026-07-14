import type { ScriptDefinition } from '../spec/definition/index.js';
import { ScriptFault } from '../spec/errors/index.js';
import type { ScriptResourceMap } from '../spec/resources/index.js';
import type { RegisteredScript } from './contracts/registered-script.js';
import type { ScriptRegistry } from './contracts/script-registry.js';
import { DefaultScriptRegistry } from './implementation/default-script-registry.js';

export const getRegisteredDefinition = <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
): ScriptDefinition<I, O, R> => {
  if (!(registry instanceof DefaultScriptRegistry)) {
    throw new ScriptFault(
      'revo.script.execution.definition_missing',
      'Script registry instance is not recognized.',
    );
  }

  return registry.readDefinition(script);
};
