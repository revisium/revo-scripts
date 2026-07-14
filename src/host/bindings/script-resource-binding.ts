import type { ScriptEffect, ScriptResourceAccess } from '../../runtime/spec/manifest/index.js';

export interface ScriptResourceBinding {
  readonly resourceId: string;
  readonly kind: 'repository';
  readonly repositoryId: string;
  readonly workspaceId?: string;
  readonly access: ScriptResourceAccess;
  readonly grant: Readonly<{
    readonly permissions: readonly string[];
    readonly effects: readonly ScriptEffect[];
  }>;
  readonly providerCoordinates: Readonly<Record<string, unknown>>;
}
