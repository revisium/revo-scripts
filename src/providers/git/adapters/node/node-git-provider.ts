import type { ProviderClientRequest } from '../../../../host/providers/provider-client-request.js';
import type { ScriptProviderModule } from '../../../../host/providers/script-provider-module.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type { ProcessExecutor } from './process-executor.js';
import { NodeGitStatusClient } from './status/node-git-status-client.js';

export class NodeGitProvider implements ScriptProviderModule {
  readonly id = 'provider:git/node';
  readonly contract = 'revo.provider.git/v1';
  readonly implementationDigest =
    'sha256:5b85c3d2ae175efaa6b634681e00a18e0d82f4a88e0261674d4dcc0390af39b1';
  readonly provenance = {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0',
  };
  readonly effects = ['git.read'] as const;
  readonly workspace = 'required';
  private readonly processExecutor: ProcessExecutor;

  constructor(processExecutor: ProcessExecutor) {
    this.processExecutor = processExecutor;
  }

  async createResourceClients(request: ProviderClientRequest) {
    if (request.workspace === undefined) {
      throw new ScriptFault(
        'revo.script.provider.workspace_required',
        'The Git provider requires a resolved workspace.',
      );
    }

    return {
      clients: {
        git: new NodeGitStatusClient(this.processExecutor, request.workspace.absolutePath),
      },
      dispose: async () => undefined,
    };
  }
}
