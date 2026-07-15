import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { createScriptRegistry } from '../../runtime/registry/create-script-registry.js';
import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ResolvedRevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

export const createDefinitionRegistry = (options: ResolvedRevoScriptsOptions): ScriptRegistry => {
  const registry = createScriptRegistry();
  const moduleIds = new Set<string>();
  const registrar: ScriptDefinitionRegistrar = {
    register: <I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>) => {
      registry.register(definition);
    },
  };

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
