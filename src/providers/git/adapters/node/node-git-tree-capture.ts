import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { NodeGitCommandRunner } from './node-git-command-runner.js';

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class NodeGitTreeCapture {
  private readonly runner: NodeGitCommandRunner;

  constructor(runner: NodeGitCommandRunner) {
    this.runner = runner;
  }

  async capture(signal: AbortSignal): Promise<string> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'revo-scripts-git-index-'));
    const environment = { GIT_INDEX_FILE: join(temporaryDirectory, 'index') };

    try {
      await this.runner.execute(['read-tree', 'HEAD'], signal, environment);
      await this.runner.execute(['add', '-A'], signal, environment);
      const tree = (await this.runner.execute(['write-tree'], signal, environment)).stdout.trim();

      if (!objectIdPattern.test(tree)) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'Git returned an invalid tree identity.',
        );
      }

      return tree;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
