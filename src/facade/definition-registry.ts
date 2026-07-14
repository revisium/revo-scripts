import { createScriptRegistry, type ScriptRegistry } from '../core/registry/script-registry.js';
import type { ScriptDefinition } from '../core/spec/script-definition.js';
import { ScriptFault } from '../core/spec/script-errors.js';
import type { ScriptResourceMap } from '../core/spec/script-resources.js';
import type { RevoScriptsOptions } from './contracts.js';
import type { ScriptDefinitionRegistrar } from './definition-module.js';

export const createDefinitionRegistry = (options: RevoScriptsOptions): ScriptRegistry => {
  const registry = createScriptRegistry();
  const moduleIds = new Set<string>();
  const registrar: ScriptDefinitionRegistrar = Object.freeze({
    register: <I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>) => {
      registry.register(definition);
    },
  });

  options.definitions.forEach((definitionModule) => {
    if (moduleIds.has(definitionModule.id)) {
      throw new ScriptFault(
        'revo.script.execution.duplicate_definition_module',
        'Definition module is registered more than once.',
      );
    }

    moduleIds.add(definitionModule.id);
    definitionModule.registerInto(registrar);
  });
  registry.seal();
  return registry;
};
