import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import type { RevoScriptsHost } from '../../host/revo-scripts-host.js';
import type { ScriptClock } from '../../runtime/spec/execution/index.js';
import type { ScriptDefinitionModule } from '../registration/script-definition-module.js';

interface RevoScriptsBaseOptions {
  readonly definitions?: readonly ScriptDefinitionModule[];
  readonly providers?: readonly ScriptProviderRegistration[];
}

export type RevoScriptsOptions = RevoScriptsBaseOptions &
  Readonly<{
    host: Readonly<{
      resources: RevoScriptsHost['resources'];
      workspaces: RevoScriptsHost['workspaces'];
      credentials: RevoScriptsHost['credentials'];
      clock?: ScriptClock;
    }>;
  }>;

export interface ResolvedRevoScriptsOptions {
  readonly definitions: readonly ScriptDefinitionModule[];
  readonly providers: readonly ScriptProviderRegistration[];
  readonly host: RevoScriptsHost;
}

export const resolveRevoScriptsHost = (options: RevoScriptsOptions): RevoScriptsHost =>
  options.host;
