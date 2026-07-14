import type { ScriptDefinition } from '../core/spec/script-definition.js';
import type { ScriptResourceMap } from '../core/spec/script-resources.js';

export interface ScriptDefinitionRegistrar {
  register<I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>): void;
}

export interface ScriptDefinitionModule {
  readonly id: string;
  readonly provenance: Readonly<{
    packageName: string;
    packageVersion: string;
  }>;
  registerInto(registrar: ScriptDefinitionRegistrar): void;
}
