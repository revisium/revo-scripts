import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type { ProcessExecutionResult, ProcessExecutor } from './process-executor.js';

const maximumOutputBytes = 1_048_576;

export class NodeGitCommandRunner {
  private readonly processExecutor: ProcessExecutor;
  private readonly absolutePath: string;

  constructor(processExecutor: ProcessExecutor, absolutePath: string) {
    this.processExecutor = processExecutor;
    this.absolutePath = absolutePath;
  }

  async execute(
    args: readonly string[],
    signal: AbortSignal,
    environment?: Readonly<Record<string, string>>,
  ): Promise<ProcessExecutionResult> {
    let result: ProcessExecutionResult;

    try {
      result = await this.processExecutor.execute({
        command: 'git',
        args,
        cwd: this.absolutePath,
        maxOutputBytes: maximumOutputBytes,
        signal,
        ...(environment === undefined ? {} : { environment }),
      });
    } catch (error: unknown) {
      throw new ScriptFault('revo.script.provider.unavailable', 'Git execution failed.', {
        cause: error,
      });
    }

    if (result.exitCode !== 0) {
      throw new ScriptFault('revo.script.provider.unavailable', 'Git execution failed.');
    }

    const encoder = new TextEncoder();
    const outputBytes =
      encoder.encode(result.stdout).byteLength + encoder.encode(result.stderr).byteLength;

    if (outputBytes > maximumOutputBytes) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git output exceeded the configured limit.',
      );
    }

    return result;
  }
}
