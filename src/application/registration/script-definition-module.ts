import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

export interface ScriptDefinitionModule {
  readonly id: string;
  readonly provenance: Readonly<{
    packageName: string;
    packageVersion: string;
  }>;
  registerInto(registrar: ScriptDefinitionRegistrar): void;
}
