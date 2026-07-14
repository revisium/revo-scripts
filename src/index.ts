export { createScriptRegistry } from './core/registry/script-registry.js';
export { createScriptSchema } from './core/runtime/create-script-schema.js';
export { defineScript } from './core/runtime/define-script.js';
export { executeScript } from './core/runtime/execute-script.js';
export { createRevoScripts } from './facade/create-revo-scripts.js';
export type {
  RevoScriptExecutionRequest,
  RevoScripts,
  RevoScriptsOptions,
  ScriptIdentityPin,
  ScriptPlanDescriptor,
  ScriptProviderPin,
} from './facade/contracts.js';
export type {
  ScriptDefinitionModule,
  ScriptDefinitionRegistrar,
} from './facade/definition-module.js';
export { builtInScripts, gitScripts } from './facade/built-ins.js';
export type {
  ScriptContext,
  ScriptDefinition,
  ScriptDefinitionInput,
  ScriptHandler,
} from './core/spec/script-definition.js';
export type { ExecuteScriptRequest } from './core/spec/script-execution.js';
export type { ScriptManifestV1 } from './core/spec/script-manifest.js';
export type { ScriptExecutionResult } from './core/spec/script-result.js';
export type { ScriptSchema } from './core/spec/script-schema.js';
