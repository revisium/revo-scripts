import { gitStatusScript } from '../scripts/git/status/versions/1.0.0/script.js';
import type { ScriptDefinitionModule, ScriptDefinitionRegistrar } from './definition-module.js';

const packageProvenance = Object.freeze({
  packageName: '@revisium/revo-scripts',
  packageVersion: '0.0.0',
});

export const gitScripts = (): ScriptDefinitionModule =>
  Object.freeze({
    id: '@revisium/revo-scripts/scripts/git',
    provenance: packageProvenance,
    registerInto: (registrar: ScriptDefinitionRegistrar) => {
      registrar.register(gitStatusScript);
    },
  });

export const builtInScripts = (): ScriptDefinitionModule =>
  Object.freeze({
    id: '@revisium/revo-scripts/scripts/built-ins',
    provenance: packageProvenance,
    registerInto: (registrar: ScriptDefinitionRegistrar) => {
      registrar.register(gitStatusScript);
    },
  });
