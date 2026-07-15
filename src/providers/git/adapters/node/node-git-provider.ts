import type { ProviderClientRequest } from '../../../../host/providers/provider-client-request.js';
import type { ScriptProviderModule } from '../../../../host/providers/script-provider-module.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type { GitCommitClient } from '../../contracts/git-commit-client.js';
import type { GitPushClient } from '../../contracts/git-push-client.js';
import type { GitStatusClient } from '../../contracts/git-status-client.js';
import { NodeGitCommitClient } from './commit/node-git-commit-client.js';
import type { ProcessExecutor } from './process-executor.js';
import { NodeGitPushClient } from './push/node-git-push-client.js';
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
  readonly effects = ['git.read', 'git.write', 'git.remote-write'] as const;
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

    const git = this.createBoundedClient(request);

    return {
      clients: {
        git,
      },
      dispose: async () => undefined,
    };
  }

  private createBoundedClient(
    request: ProviderClientRequest,
  ): GitStatusClient | GitCommitClient | GitPushClient {
    const absolutePath = request.workspace?.absolutePath;
    if (absolutePath === undefined) {
      throw new ScriptFault(
        'revo.script.provider.workspace_required',
        'The Git provider requires a resolved workspace.',
      );
    }
    if (request.requirement.access === 'publish') {
      return new NodeGitPushClient(this.processExecutor, absolutePath);
    }
    if (request.requirement.access === 'write') {
      return new NodeGitCommitClient(this.processExecutor, absolutePath);
    }
    return new NodeGitStatusClient(this.processExecutor, absolutePath);
  }
}
