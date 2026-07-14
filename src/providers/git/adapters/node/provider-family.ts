import type { ScriptProviderRegistration } from '../../../../host/provider-module.js';
import type { ProcessExecutor } from './process-executor.js';
import { createNodeGitProviderR1 } from './revisions/r1/provider.js';

export interface NodeGitProvidersOptions {
  readonly processExecutor: ProcessExecutor;
  readonly defaultRevision?: string;
}

export const nodeGitProviders = (
  options: NodeGitProvidersOptions,
): readonly ScriptProviderRegistration[] => {
  if (options.defaultRevision !== undefined && options.defaultRevision !== 'r1') {
    throw new TypeError('Unknown Node Git provider revision.');
  }

  return Object.freeze([
    Object.freeze({
      module: createNodeGitProviderR1(options.processExecutor),
      useForNewPlans: true,
    }),
  ]);
};
