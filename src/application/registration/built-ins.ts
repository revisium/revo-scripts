import {
  builtInDefinitionInventory,
  type BuiltInDefinitionFamily,
} from './built-in-definition-inventory.js';
import type { ScriptDefinitionModule } from './script-definition-module.js';
import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

const packageProvenance = {
  packageName: '@revisium/revo-scripts',
  packageVersion: '0.0.0',
};

const definitionModule = (
  id: string,
  family?: BuiltInDefinitionFamily,
): ScriptDefinitionModule => ({
  id,
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    for (const entry of builtInDefinitionInventory) {
      if (family === undefined || entry.family === family) {
        entry.registerInto(registrar);
      }
    }
  },
});

export const approvalScripts = (): ScriptDefinitionModule =>
  definitionModule('@revisium/revo-scripts/scripts/approval', 'approval');

export const gitScripts = (): ScriptDefinitionModule =>
  definitionModule('@revisium/revo-scripts/scripts/git', 'git');

export const builtInScripts = (): ScriptDefinitionModule =>
  definitionModule('@revisium/revo-scripts/scripts/built-ins');

export const systemScripts = (): ScriptDefinitionModule =>
  definitionModule('@revisium/revo-scripts/scripts/system', 'system');

export const githubScripts = (): ScriptDefinitionModule =>
  definitionModule('@revisium/revo-scripts/scripts/github', 'github');
