import { expect, test } from 'vitest';

import { NodeGitStatusClient } from '../../../src/providers/git/adapters/node/status/node-git-status-client.js';
import {
  captureProviderFault,
  createProcessExecutor,
  gitProviderSignal,
} from '../../support/git/git-provider-fixture.js';

test('maps process and output failures without exposing provider output', async () => {
  const processFailure = new NodeGitStatusClient(
    createProcessExecutor(async () => {
      throw new Error('secret process diagnostics');
    }),
    '/tmp/repository',
  );
  const exitFailure = new NodeGitStatusClient(
    createProcessExecutor(async () => ({
      exitCode: 128,
      stdout: '',
      stderr: 'secret git diagnostics',
    })),
    '/tmp/repository',
  );
  const oversized = new NodeGitStatusClient(
    createProcessExecutor(async () => ({
      exitCode: 0,
      stdout: '',
      stderr: 'x'.repeat(1_048_577),
    })),
    '/tmp/repository',
  );

  expect({
    process: await captureProviderFault(() => processFailure.readStatus(gitProviderSignal)),
    exit: await captureProviderFault(() => exitFailure.readStatus(gitProviderSignal)),
    oversized: await captureProviderFault(() => oversized.readStatus(gitProviderSignal)),
  }).toEqual({
    process: {
      name: 'ScriptFault',
      code: 'revo.script.provider.unavailable',
      message: 'Git status execution failed.',
      retryable: false,
    },
    exit: {
      name: 'ScriptFault',
      code: 'revo.script.provider.unavailable',
      message: 'Git status execution failed.',
      retryable: false,
    },
    oversized: {
      name: 'ScriptFault',
      code: 'revo.script.provider.invalid_response',
      message: 'Git status output exceeded the configured limit.',
      retryable: false,
    },
  });
});
