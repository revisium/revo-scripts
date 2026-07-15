import { expect, test } from 'vitest';

import { NodeProcessExecutor } from '../../../src/providers/git/index.js';

const executor = new NodeProcessExecutor();
const signal = new AbortController().signal;

test('returns bounded stdout and stderr for a successful process', async () => {
  const result = await executor.execute({
    command: process.execPath,
    args: ['-e', "process.stdout.write('out'); process.stderr.write('err');"],
    cwd: process.cwd(),
    maxOutputBytes: 1024,
    signal,
  });

  expect(result).toEqual({ exitCode: 0, stdout: 'out', stderr: 'err' });
});

test('returns a structured non-zero result for a failed process', async () => {
  const result = await executor.execute({
    command: process.execPath,
    args: ['-e', "process.stderr.write('failed'); process.exit(7);"],
    cwd: process.cwd(),
    maxOutputBytes: 1024,
    signal,
  });

  expect(result.exitCode).toBe(7);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('failed');
});

test('normalizes unavailable commands to an execution failure result', async () => {
  const result = await executor.execute({
    command: 'revo-command-that-does-not-exist',
    args: [],
    cwd: process.cwd(),
    maxOutputBytes: 1024,
    signal,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('revo-command-that-does-not-exist');
});
