import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import type { ProcessExecutor } from '../../../src/providers/git/index.js';

const execFileAsync = promisify(execFile);

const runGit = async (cwd: string, args: readonly string[]): Promise<string> =>
  (await execFileAsync('git', [...args], { cwd, encoding: 'utf8' })).stdout.trim();

export const consumerFlowProcessExecutor: ProcessExecutor = {
  execute: async (request) => {
    const result = await execFileAsync(request.command, [...request.args], {
      cwd: request.cwd,
      encoding: 'utf8',
      maxBuffer: request.maxOutputBytes,
      signal: request.signal,
      env: { ...process.env, ...request.environment },
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  },
};

export interface ConsumerFlowGitFixture {
  readonly repository: string;
  readonly repositoryId: 'consumer-flow-repository';
  readonly workspaceId: 'consumer-flow-workspace';
  readonly branch: 'revo/consumer-flow';
  readonly remoteIdentity: string;
  readonly baseCommit: string;
  readonly baseCapture: string;
  readonly headCapture: string;
  readRemoteHead(): Promise<string>;
  dispose(): Promise<void>;
}

export const createConsumerFlowGitFixture = async (): Promise<ConsumerFlowGitFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'revo-scripts-consumer-flow-'));
  const repository = join(root, 'repository');
  const remote = join(root, 'remote.git');
  const branch = 'revo/consumer-flow' as const;

  try {
    await runGit(root, ['init', '--bare', remote]);
    await runGit(root, ['init', '-b', 'master', repository]);
    await runGit(repository, ['config', 'user.name', 'Revo Scripts Test']);
    await runGit(repository, ['config', 'user.email', 'revo-scripts@example.test']);
    const remoteIdentity = pathToFileURL(remote).href;
    await runGit(repository, ['remote', 'add', 'origin', remoteIdentity]);
    await writeFile(join(repository, 'tracked.txt'), 'initial\n');
    await runGit(repository, ['add', 'tracked.txt']);
    await runGit(repository, ['commit', '-m', 'initial']);
    await runGit(repository, ['push', 'origin', 'master']);
    const baseCommit = await runGit(repository, ['rev-parse', 'HEAD']);
    await runGit(repository, ['switch', '-c', branch]);
    await writeFile(join(repository, 'tracked.txt'), 'consumer-flow\n');
    await writeFile(join(repository, 'consumer-flow.txt'), 'composed through the public facade\n');
    await runGit(repository, ['add', '-A']);
    const headCapture = `git-tree:${await runGit(repository, ['write-tree'])}`;
    await runGit(repository, ['reset']);

    return {
      repository,
      repositoryId: 'consumer-flow-repository',
      workspaceId: 'consumer-flow-workspace',
      branch,
      remoteIdentity,
      baseCommit,
      baseCapture: `git-commit:${baseCommit}`,
      headCapture,
      readRemoteHead: async () => await runGit(remote, ['rev-parse', `refs/heads/${branch}`]),
      dispose: async () => await rm(root, { recursive: true, force: true }),
    };
  } catch (error: unknown) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
};
