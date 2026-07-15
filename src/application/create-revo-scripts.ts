import {
  resolveRevoScriptsHost,
  type RevoScriptsOptions,
} from './contracts/revo-scripts-options.js';
import type { RevoScripts } from './contracts/revo-scripts.js';
import { DefaultRevoScripts } from './default-revo-scripts.js';

export const createRevoScripts = (options: RevoScriptsOptions): RevoScripts =>
  new DefaultRevoScripts({ ...options, host: resolveRevoScriptsHost(options) });
