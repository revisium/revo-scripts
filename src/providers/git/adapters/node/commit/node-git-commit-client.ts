import { createHash } from 'node:crypto';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitCommitClient,
  GitCommitRequest,
  GitCommitSnapshot,
} from '../../../contracts/git-commit-client.js';
import { NodeGitCommandRunner } from '../node-git-command-runner.js';
import type { ProcessExecutor } from '../process-executor.js';

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class NodeGitCommitClient implements GitCommitClient {
  private readonly runner: NodeGitCommandRunner;

  constructor(processExecutor: ProcessExecutor, absolutePath: string) {
    this.runner = new NodeGitCommandRunner(processExecutor, absolutePath);
  }

  async commit(request: GitCommitRequest): Promise<GitCommitSnapshot> {
    await this.runner.execute(['check-ref-format', '--branch', request.branch], request.signal);
    await this.runner.execute(['cat-file', '-e', `${request.expectedTree}^{tree}`], request.signal);
    const currentHead = await this.readBranchHead(request.branch, request.signal);

    if (currentHead !== request.expectedParent) {
      return await this.reconcileExistingCommit(request, currentHead);
    }

    const marker = this.operationMarker(request.operationKey);
    const message = this.withMarker(request.message, marker);
    const commit = (
      await this.runner.execute(
        ['commit-tree', request.expectedTree, '-p', request.expectedParent, '-m', message],
        request.signal,
        {
          GIT_AUTHOR_NAME: request.author.name,
          GIT_AUTHOR_EMAIL: request.author.email,
          GIT_AUTHOR_DATE: request.author.timestamp,
          GIT_COMMITTER_NAME: request.author.name,
          GIT_COMMITTER_EMAIL: request.author.email,
          GIT_COMMITTER_DATE: request.author.timestamp,
        },
      )
    ).stdout.trim();
    this.assertObjectId(commit);
    await this.runner.execute(
      ['update-ref', `refs/heads/${request.branch}`, commit, request.expectedParent],
      request.signal,
    );

    return this.snapshot(request, commit);
  }

  private async reconcileExistingCommit(
    request: GitCommitRequest,
    currentHead: string,
  ): Promise<GitCommitSnapshot> {
    const format = '%P%n%T%n%B';
    const output = (
      await this.runner.execute(['show', '-s', `--format=${format}`, currentHead], request.signal)
    ).stdout.trimEnd();
    const [parents = '', tree = '', ...body] = output.split('\n');
    const markers = body.filter((line) => line.startsWith('Revo-Operation-Key:'));

    if (
      parents === request.expectedParent &&
      tree === request.expectedTree &&
      markers.length === 1 &&
      markers[0] === `Revo-Operation-Key: ${this.operationMarker(request.operationKey)}`
    ) {
      return this.snapshot(request, currentHead);
    }

    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'The Git branch moved to a commit that does not match this operation.',
    );
  }

  private async readBranchHead(branch: string, signal: AbortSignal): Promise<string> {
    const head = (
      await this.runner.execute(['rev-parse', '--verify', `refs/heads/${branch}`], signal)
    ).stdout.trim();
    this.assertObjectId(head);
    return head;
  }

  private operationMarker(operationKey: string): string {
    return `sha256:${createHash('sha256').update(operationKey).digest('hex')}`;
  }

  private withMarker(message: string, marker: string): string {
    const normalized = message
      .replace(/\r\n?/gu, '\n')
      .split('\n')
      .filter((line) => !line.startsWith('Revo-Operation-Key:'))
      .join('\n')
      .trimEnd();
    return `${normalized}\n\nRevo-Operation-Key: ${marker}`;
  }

  private snapshot(request: GitCommitRequest, headCommit: string): GitCommitSnapshot {
    return {
      remoteIdentity: request.remoteIdentity,
      branch: request.branch,
      baseCommit: request.expectedParent,
      headCommit,
      commits: [headCommit],
    };
  }

  private assertObjectId(value: string): void {
    if (!objectIdPattern.test(value)) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an invalid commit identity.',
      );
    }
  }
}
