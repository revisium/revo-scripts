import { NodeGitStatusClient } from '../../../src/providers/git/adapters/node/status/node-git-status-client.js';
import type { ProcessExecutor } from '../../../src/providers/git/index.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';

export const gitProviderHeadSha = '0123456789abcdef0123456789abcdef01234567';
export const gitProviderSignal = new AbortController().signal;

export const createProcessExecutor = (execute: ProcessExecutor['execute']): ProcessExecutor => ({
  execute,
});

export const createStatusClient = (stdout: string): NodeGitStatusClient =>
  new NodeGitStatusClient(
    createProcessExecutor(async () => ({ exitCode: 0, stdout, stderr: '' })),
    '/tmp/repository',
  );

export const captureProviderFault = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new TypeError('Expected operation to throw an Error.', { cause: error });
    }

    return {
      name: error.name,
      code: error instanceof ScriptFault ? error.code : undefined,
      message: error.message,
      retryable: error instanceof ScriptFault ? error.retryable : undefined,
    };
  }

  throw new Error('Expected operation to fail.');
};
