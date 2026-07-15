import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ProcessExecutionRequest,
  ProcessExecutionResult,
  ProcessExecutor,
} from './process-executor.js';

const executeFile = promisify(execFile);

const normalizeProcessFailure = (error: unknown): ProcessExecutionResult => {
  const failure = error instanceof Error ? error : new Error('Process execution failed.');
  const details = typeof error === 'object' && error !== null ? error : {};
  const code = 'code' in details ? details.code : undefined;
  const stdout = 'stdout' in details && typeof details.stdout === 'string' ? details.stdout : '';
  const stderr =
    'stderr' in details && typeof details.stderr === 'string' && details.stderr.length > 0
      ? details.stderr
      : failure.message;
  return {
    exitCode: typeof code === 'number' ? code : 1,
    stdout,
    stderr,
  };
};

export class NodeProcessExecutor implements ProcessExecutor {
  async execute(request: ProcessExecutionRequest): Promise<ProcessExecutionResult> {
    try {
      const result = await executeFile(request.command, [...request.args], {
        cwd: request.cwd,
        env: { ...process.env, ...request.environment },
        maxBuffer: request.maxOutputBytes,
        encoding: 'utf8',
        signal: request.signal,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error: unknown) {
      return normalizeProcessFailure(error);
    }
  }
}
