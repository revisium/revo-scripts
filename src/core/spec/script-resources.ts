import type { ScriptEffect, ScriptResourceAccess } from './script-manifest.js';

export interface ScriptResourceHandle<TClients extends object> {
  readonly name: string;
  readonly kind: 'repository';
  readonly access: ScriptResourceAccess;
  readonly grant: Readonly<{
    permissions: readonly string[];
    effects: readonly ScriptEffect[];
  }>;
  readonly clients: TClients;
}

export type ScriptResourceMap = Readonly<Record<string, ScriptResourceHandle<object>>>;
