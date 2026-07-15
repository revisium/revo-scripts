import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import type { RevoScriptsHost } from '../../host/revo-scripts-host.js';
import type { ScriptDefinitionModule } from '../registration/script-definition-module.js';

interface RevoScriptsBaseOptions {
  readonly definitions?: readonly ScriptDefinitionModule[];
  readonly providers?: readonly ScriptProviderRegistration[];
}

export type RevoScriptsOptions = RevoScriptsBaseOptions &
  (
    | { readonly host: RevoScriptsHost }
    | {
        readonly workspaces: RevoScriptsHost['workspaces'];
        readonly credentials: RevoScriptsHost['credentials'];
        readonly events: RevoScriptsHost['events'];
        readonly clock?: RevoScriptsHost['clock'];
      }
  );

export interface ResolvedRevoScriptsOptions {
  readonly definitions: readonly ScriptDefinitionModule[];
  readonly providers: readonly ScriptProviderRegistration[];
  readonly host: RevoScriptsHost;
}

export const resolveRevoScriptsHost = (options: RevoScriptsOptions): RevoScriptsHost => {
  if ('host' in options) {
    return options.host;
  }
  return {
    workspaces: options.workspaces,
    credentials: options.credentials,
    events: options.events,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  };
};
