import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import { NodeGitCommandRunner } from '../node-git-command-runner.js';
import { canonicalGitRemote } from './canonical-git-remote.js';

export class NodeGitRemoteResolver {
  private readonly runner: NodeGitCommandRunner;

  constructor(runner: NodeGitCommandRunner) {
    this.runner = runner;
  }

  async resolveName(remoteIdentity: string, signal: AbortSignal): Promise<string> {
    const expected = canonicalGitRemote(remoteIdentity);
    const remotes = (await this.runner.execute(['remote'], signal)).stdout
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const candidates = await Promise.all(
      remotes.map(async (remote) => ({
        remote,
        url: (await this.runner.execute(['remote', 'get-url', remote], signal)).stdout.trim(),
      })),
    );
    const matching = candidates.find((candidate) => canonicalGitRemote(candidate.url) === expected);
    if (matching !== undefined) {
      return matching.remote;
    }

    throw new ScriptFault(
      'revo.script.provider.resource_mismatch',
      'No configured Git remote matches the requested repository identity.',
    );
  }
}
