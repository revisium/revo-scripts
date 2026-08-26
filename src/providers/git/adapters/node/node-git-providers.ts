import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import { NodeGitProvider } from './node-git-provider.js';
import type { ProcessExecutor } from './process-executor.js';

const nodeGitProviderImplementationDigest =
  'sha256:d9c39cdbe2339d65a960ce9f83bf69129905f5663cd7675d53232f819e5359fc' as const;

export interface NodeGitProvidersOptions {
  readonly processExecutor: ProcessExecutor;
}

export const nodeGitProviders = (
  options: NodeGitProvidersOptions,
): readonly ScriptProviderRegistration[] => {
  return [
    {
      module: new NodeGitProvider(options.processExecutor, nodeGitProviderImplementationDigest),
    },
  ];
};
