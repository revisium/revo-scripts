import type { ScriptEffect, ScriptResourceAccess } from './script-manifest.js';

export interface ScriptResourceHandle<TCapabilities extends object> {
  readonly name: string;
  readonly kind: 'repository';
  readonly access: ScriptResourceAccess;
  readonly grant: Readonly<{
    permissions: readonly string[];
    effects: readonly ScriptEffect[];
  }>;
  readonly capabilities: TCapabilities;
}

export type ScriptResourceMap = Readonly<Record<string, ScriptResourceHandle<object>>>;
