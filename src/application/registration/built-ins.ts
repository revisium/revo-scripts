import { gitStatusScript } from '../../scripts/git/status/script.js';
import type { ScriptDefinitionModule } from './script-definition-module.js';
import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

const packageProvenance = {
  packageName: '@revisium/revo-scripts',
  packageVersion: '0.0.0',
};

export const gitScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/git',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(gitStatusScript);
  },
});

export const builtInScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/built-ins',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(gitStatusScript);
  },
});
