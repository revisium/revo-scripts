import type { ScriptEffect } from '../manifest/script-effect.js';
import type { ScriptResourceAccess } from '../manifest/script-resource-access.js';

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
