import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitStatusClient, GitStatusSnapshot } from '../../../contracts/git-status-client.js';
import type { ProcessExecutor } from '../process-executor.js';
import { PorcelainV2Parser } from './porcelain-v2-parser.js';

const maximumOutputBytes = 1_048_576;

export class NodeGitStatusClient implements GitStatusClient {
  private readonly processExecutor: ProcessExecutor;
  private readonly absolutePath: string;

  constructor(processExecutor: ProcessExecutor, absolutePath: string) {
    this.processExecutor = processExecutor;
    this.absolutePath = absolutePath;
  }

  async readStatus(signal: AbortSignal): Promise<GitStatusSnapshot> {
    let result;
    try {
      result = await this.processExecutor.execute({
        command: 'git',
        args: ['status', '--porcelain=v2', '--branch', '-z'],
        cwd: this.absolutePath,
        maxOutputBytes: maximumOutputBytes,
        signal,
      });
    } catch (error: unknown) {
      throw new ScriptFault('revo.script.provider.unavailable', 'Git status execution failed.', {
        cause: error,
      });
    }

    if (result.exitCode !== 0) {
      throw new ScriptFault('revo.script.provider.unavailable', 'Git status execution failed.');
    }

    const encoder = new TextEncoder();
    const outputBytes =
      encoder.encode(result.stdout).byteLength + encoder.encode(result.stderr).byteLength;

    if (outputBytes > maximumOutputBytes) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git status output exceeded the configured limit.',
      );
    }

    return new PorcelainV2Parser().parse(result.stdout);
  }
}
