import type { ScriptProviderRegistration } from '../../host/providers/script-provider-registration.js';
import type { RevoScriptsHost } from '../../host/revo-scripts-host.js';
import type { ScriptDefinitionModule } from '../registration/script-definition-module.js';

export interface RevoScriptsOptions {
  readonly definitions: readonly ScriptDefinitionModule[];
  readonly providers: readonly ScriptProviderRegistration[];
  readonly host: RevoScriptsHost;
}
