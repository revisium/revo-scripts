import { ScriptFault } from '../../../../../../core/spec/script-errors.js';
import type {
  ProviderClientRequest,
  ScriptProviderModule,
} from '../../../../../../host/provider-module.js';
import type { ProcessExecutor } from '../../process-executor.js';
import { createGitStatusClient } from './status-client.js';

export const createNodeGitProviderR1 = (processExecutor: ProcessExecutor): ScriptProviderModule => {
  const provider: ScriptProviderModule = {
    id: 'provider:git/node/r1',
    contract: 'revo.provider.git/v1',
    implementationDigest: 'sha256:5b85c3d2ae175efaa6b634681e00a18e0d82f4a88e0261674d4dcc0390af39b1',
    provenance: Object.freeze({
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0',
    }),
    effects: Object.freeze(['git.read']),
    workspace: 'required',
    createResourceClients: async (request: ProviderClientRequest) => {
      if (request.workspace === undefined) {
        throw new ScriptFault(
          'revo.script.provider.workspace_required',
          'The Git provider requires a resolved workspace.',
        );
      }

      return Object.freeze({
        clients: Object.freeze({
          git: createGitStatusClient(processExecutor, request.workspace.absolutePath),
        }),
        dispose: async () => undefined,
      });
    },
  };

  return Object.freeze(provider);
};
