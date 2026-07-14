import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';

export interface ScriptDefinitionRegistrar {
  register<I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>): void;
}
