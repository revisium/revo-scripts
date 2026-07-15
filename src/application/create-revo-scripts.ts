import { nodeGitProviders, NodeProcessExecutor } from '../providers/git/index.js';
import { fetchGitHubProviders } from '../providers/github/index.js';
import {
  resolveRevoScriptsHost,
  type RevoScriptsOptions,
  type ResolvedRevoScriptsOptions,
} from './contracts/revo-scripts-options.js';
import type { RevoScripts } from './contracts/revo-scripts.js';
import { DefaultRevoScripts } from './default-revo-scripts.js';
import { builtInScripts } from './registration/built-ins.js';

export const createRevoScripts = (options: RevoScriptsOptions): RevoScripts => {
  const resolved: ResolvedRevoScriptsOptions = {
    definitions: options.definitions ?? [builtInScripts()],
    providers: options.providers ?? [
      ...nodeGitProviders({ processExecutor: new NodeProcessExecutor() }),
      ...fetchGitHubProviders(),
    ],
    host: resolveRevoScriptsHost(options),
  };
  return new DefaultRevoScripts(resolved);
};
