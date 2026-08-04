import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import { NodeGitProvider } from './node-git-provider.js';
import type { ProcessExecutor } from './process-executor.js';

const nodeGitProviderImplementationDigest =
  'sha256:9d6b294c77575e54772a6678c687f9b3848dea587cc9c8729451f7e15041fa66' as const;

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
