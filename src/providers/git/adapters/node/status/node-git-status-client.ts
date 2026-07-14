import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitStatusClient, GitStatusSnapshot } from '../../../contracts/git-status-client.js';
import { NodeGitCommandRunner } from '../node-git-command-runner.js';
import { NodeGitTreeCapture } from '../node-git-tree-capture.js';
import type { ProcessExecutor } from '../process-executor.js';
import { PorcelainV2Parser } from './porcelain-v2-parser.js';

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class NodeGitStatusClient implements GitStatusClient {
  private readonly runner: NodeGitCommandRunner;
  private readonly treeCapture: NodeGitTreeCapture;

  constructor(processExecutor: ProcessExecutor, absolutePath: string) {
    this.runner = new NodeGitCommandRunner(processExecutor, absolutePath);
    this.treeCapture = new NodeGitTreeCapture(this.runner);
  }

  async readStatus(signal: AbortSignal): Promise<GitStatusSnapshot> {
    const status = await this.runner.execute(
      ['status', '--porcelain=v2', '--branch', '-z'],
      signal,
    );
    const baseCommit = (await this.runner.execute(['rev-parse', 'HEAD'], signal)).stdout.trim();
    this.assertObjectId(baseCommit, 'commit');
    const tree = await this.treeCapture.capture(signal);
    const changedPaths = new PorcelainV2Parser().parseChangedPaths(status.stdout);

    return {
      baseCapture: `git-commit:${baseCommit}`,
      headCapture: `git-tree:${tree}`,
      changedPaths,
      clean: changedPaths.length === 0,
    };
  }

  private assertObjectId(value: string, kind: 'commit'): void {
    if (!objectIdPattern.test(value)) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        `Git returned an invalid ${kind} identity.`,
      );
    }
  }
}
