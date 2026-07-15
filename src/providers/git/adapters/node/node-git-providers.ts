import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import { NodeGitProvider } from './node-git-provider.js';
import type { ProcessExecutor } from './process-executor.js';

export interface NodeGitProvidersOptions {
  readonly processExecutor: ProcessExecutor;
}

export const nodeGitProviders = (
  options: NodeGitProvidersOptions,
): readonly ScriptProviderRegistration[] => {
  return [
    {
      module: new NodeGitProvider(options.processExecutor),
    },
  ];
};
