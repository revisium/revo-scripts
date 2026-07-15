import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitPushClient,
  GitPushRequest,
  GitPushSnapshot,
} from '../../../contracts/git-push-client.js';
import { NodeGitCommandRunner } from '../node-git-command-runner.js';
import type { ProcessExecutor } from '../process-executor.js';
import { NodeGitRemoteResolver } from '../remote/node-git-remote-resolver.js';

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class NodeGitPushClient implements GitPushClient {
  private readonly runner: NodeGitCommandRunner;
  private readonly remoteResolver: NodeGitRemoteResolver;

  constructor(processExecutor: ProcessExecutor, absolutePath: string) {
    this.runner = new NodeGitCommandRunner(processExecutor, absolutePath);
    this.remoteResolver = new NodeGitRemoteResolver(this.runner);
  }

  async push(request: GitPushRequest): Promise<GitPushSnapshot> {
    const remote = await this.remoteResolver.resolveName(request.remoteIdentity, request.signal);
    await this.runner.execute(['check-ref-format', '--branch', request.branch], request.signal);
    const localHead = (
      await this.runner.execute(
        ['rev-parse', '--verify', `refs/heads/${request.branch}`],
        request.signal,
      )
    ).stdout.trim();

    if (localHead !== request.headCommit) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The local Git branch does not match the pinned commit.',
      );
    }

    const mergeBase = (
      await this.runner.execute(
        ['merge-base', request.expectedRemoteHead, request.headCommit],
        request.signal,
      )
    ).stdout.trim();
    if (mergeBase !== request.expectedRemoteHead) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pinned Git commit is not a fast-forward from the expected remote head.',
      );
    }

    const remoteHead = await this.readRemoteHead(remote, request.branch, request.signal);
    if (remoteHead === request.headCommit) {
      return { status: 'already-published', remoteHead };
    }
    if (remoteHead !== undefined && remoteHead !== request.expectedRemoteHead) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The remote Git branch already points to a different commit.',
      );
    }

    const leaseHead = remoteHead === undefined ? '' : request.expectedRemoteHead;
    await this.runner.execute(
      [
        'push',
        `--force-with-lease=refs/heads/${request.branch}:${leaseHead}`,
        remote,
        `${request.headCommit}:refs/heads/${request.branch}`,
      ],
      request.signal,
    );
    const publishedHead = await this.readRemoteHead(remote, request.branch, request.signal);
    if (publishedHead !== request.headCommit) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git did not confirm the requested remote head after push.',
      );
    }

    return { status: 'pushed', remoteHead: publishedHead };
  }

  private async readRemoteHead(
    remote: string,
    branch: string,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const output = (
      await this.runner.execute(['ls-remote', '--heads', remote, `refs/heads/${branch}`], signal)
    ).stdout.trim();
    if (output.length === 0) {
      return undefined;
    }

    const [head, ref, extra] = output.split(/\s+/u);
    if (
      head === undefined ||
      !objectIdPattern.test(head) ||
      ref !== `refs/heads/${branch}` ||
      extra !== undefined
    ) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid remote branch identity.',
      );
    }
    return head;
  }
}
