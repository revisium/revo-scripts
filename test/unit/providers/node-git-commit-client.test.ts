import { createHash } from 'node:crypto';

import { expect, test } from 'vitest';

import { NodeGitCommitClient } from '../../../src/providers/git/adapters/node/commit/node-git-commit-client.js';
import type {
  ProcessExecutionRequest,
  ProcessExecutor,
} from '../../../src/providers/git/adapters/node/process-executor.js';

const parent = '0123456789abcdef0123456789abcdef01234567';
const tree = '89abcdef0123456789abcdef0123456789abcdef';
const commit = 'fedcba9876543210fedcba9876543210fedcba98';
const marker = `sha256:${createHash('sha256').update('commit-operation').digest('hex')}`;

const request = {
  remoteIdentity: 'github.com/revisium/revo-scripts',
  branch: 'revo/task',
  expectedParent: parent,
  expectedTree: tree,
  message: 'feat: #351 add bounded scripts\r\nRevo-Operation-Key: caller supplied',
  operationKey: 'commit-operation',
  author: {
    name: 'Revisium Bot',
    email: 'bot@revisium.io',
    timestamp: '2026-07-15T09:00:00.000Z',
  },
  signal: new AbortController().signal,
};

const executeCommit = async (currentHead: string, body = '') => {
  const commands: ProcessExecutionRequest[] = [];
  const executor: ProcessExecutor = {
    execute: async (operation) => {
      commands.push(operation);
      if (operation.args[0] === 'rev-parse') {
        return { exitCode: 0, stdout: `${currentHead}\n`, stderr: '' };
      }
      if (operation.args[0] === 'show') {
        return { exitCode: 0, stdout: `${parent}\n${tree}\n${body}`, stderr: '' };
      }
      if (operation.args[0] === 'commit-tree') {
        return { exitCode: 0, stdout: `${commit}\n`, stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  const client = new NodeGitCommitClient(executor, '/trusted/workspace');
  return { commands, result: await client.commit(request) };
};

test('normalizes LF, strips caller markers, and writes exactly one host marker', async () => {
  const { commands, result } = await executeCommit(parent);
  const commitTree = commands.find((command) => command.args[0] === 'commit-tree');

  expect({
    result,
    message: commitTree?.args.at(-1),
    environment: commitTree?.environment,
    updates: commands.filter((command) => command.args[0] === 'update-ref').length,
  }).toEqual({
    result: {
      remoteIdentity: request.remoteIdentity,
      branch: request.branch,
      baseCommit: parent,
      headCommit: commit,
      commits: [commit],
    },
    message: `feat: #351 add bounded scripts\n\nRevo-Operation-Key: ${marker}`,
    environment: {
      GIT_AUTHOR_NAME: 'Revisium Bot',
      GIT_AUTHOR_EMAIL: 'bot@revisium.io',
      GIT_AUTHOR_DATE: '2026-07-15T09:00:00.000Z',
      GIT_COMMITTER_NAME: 'Revisium Bot',
      GIT_COMMITTER_EMAIL: 'bot@revisium.io',
      GIT_COMMITTER_DATE: '2026-07-15T09:00:00.000Z',
    },
    updates: 1,
  });
});

test('replays only the exact current-head commit and never creates a duplicate', async () => {
  const { commands, result } = await executeCommit(
    commit,
    `feat: #351 add bounded scripts\n\nRevo-Operation-Key: ${marker}\n`,
  );

  expect({
    result,
    commitWrites: commands.filter((command) => command.args[0] === 'commit-tree').length,
  }).toEqual({
    result: {
      remoteIdentity: request.remoteIdentity,
      branch: request.branch,
      baseCommit: parent,
      headCommit: commit,
      commits: [commit],
    },
    commitWrites: 0,
  });
});

test.each([
  ['moved head', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ''],
  [
    'malformed marker',
    commit,
    'feat: #351 add bounded scripts\n\nRevo-Operation-Key: sha256:not-a-fingerprint\n',
  ],
  [
    'duplicate marker',
    commit,
    `feat\n\nRevo-Operation-Key: ${marker}\nRevo-Operation-Key: ${marker}\n`,
  ],
])('blocks %s instead of writing another commit', async (_name, currentHead, body) => {
  await expect(executeCommit(currentHead, body)).rejects.toMatchObject({
    code: 'revo.script.idempotency.conflict',
  });
});
