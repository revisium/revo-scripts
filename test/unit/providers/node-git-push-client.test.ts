import { expect, test } from 'vitest';

import type {
  ProcessExecutionRequest,
  ProcessExecutor,
} from '../../../src/providers/git/adapters/node/process-executor.js';
import { NodeGitPushClient } from '../../../src/providers/git/adapters/node/push/node-git-push-client.js';

const base = '0123456789abcdef0123456789abcdef01234567';
const head = 'fedcba9876543210fedcba9876543210fedcba98';

const executePush = async (initialRemoteHead: string | undefined) => {
  const requests: ProcessExecutionRequest[] = [];
  let remoteReads = 0;
  const processExecutor: ProcessExecutor = {
    execute: async (request) => {
      requests.push(request);
      const operation = request.args[0];
      if (operation === 'remote' && request.args[1] === undefined) {
        return { exitCode: 0, stdout: 'origin\n', stderr: '' };
      }
      if (operation === 'remote') {
        return { exitCode: 0, stdout: 'git@github.com:revisium/revo-scripts.git\n', stderr: '' };
      }
      if (operation === 'rev-parse') {
        return { exitCode: 0, stdout: `${head}\n`, stderr: '' };
      }
      if (operation === 'merge-base') {
        return { exitCode: 0, stdout: `${base}\n`, stderr: '' };
      }
      if (operation === 'ls-remote') {
        remoteReads += 1;
        const value = remoteReads === 1 ? initialRemoteHead : head;
        return {
          exitCode: 0,
          stdout: value === undefined ? '' : `${value}\trefs/heads/revo/task\n`,
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  const client = new NodeGitPushClient(processExecutor, '/trusted/workspace');

  const result = await client.push({
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task',
    expectedRemoteHead: base,
    headCommit: head,
    operationKey: 'push-operation',
    signal: new AbortController().signal,
  });

  const commands = requests.map((request) => request.args);
  return {
    result,
    mergeBase: commands.find((args) => args[0] === 'merge-base'),
    push: commands.find((args) => args[0] === 'push'),
  };
};

test('publishes an existing branch through an exact remote-head lease', async () => {
  expect(await executePush(base)).toEqual({
    result: { status: 'pushed', remoteHead: head },
    mergeBase: ['merge-base', base, head],
    push: [
      'push',
      `--force-with-lease=refs/heads/revo/task:${base}`,
      'origin',
      `${head}:refs/heads/revo/task`,
    ],
  });
});

test('publishes a new branch through a must-not-exist lease', async () => {
  expect(await executePush(undefined)).toEqual({
    result: { status: 'pushed', remoteHead: head },
    mergeBase: ['merge-base', base, head],
    push: [
      'push',
      '--force-with-lease=refs/heads/revo/task:',
      'origin',
      `${head}:refs/heads/revo/task`,
    ],
  });
});
