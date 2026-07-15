import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../src/index.js';
import { nodeGitProviders, type ProcessExecutor } from '../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../support/git/git-fixture.js';

const execFileAsync = promisify(execFile);

const processExecutor: ProcessExecutor = {
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

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await execFileAsync('git', [...args], { cwd, encoding: 'utf8' });
  return result.stdout.trim();
};

test('executes the production Node Git provider against a real temporary repository', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'revo-scripts-git-'));

  try {
    await git(repository, ['init', '-b', 'master']);
    await writeFile(join(repository, 'tracked.txt'), 'initial\n');
    await git(repository, ['add', 'tracked.txt']);
    await git(repository, [
      '-c',
      'user.name=Revo Scripts Test',
      '-c',
      'user.email=revo-scripts@example.test',
      'commit',
      '-m',
      'initial',
    ]);
    const headSha = await git(repository, ['rev-parse', 'HEAD']);
    await writeFile(join(repository, 'tracked.txt'), 'changed\n');
    await writeFile(join(repository, 'untracked.txt'), 'new\n');
    await git(repository, ['add', '-A']);
    const expectedTree = await git(repository, ['write-tree']);

    const { host } = createGitHost({
      resolveWorkspace: async (workspaceId) => ({
        workspaceId,
        repositoryId: 'temporary-repository',
        absolutePath: repository,
      }),
    });
    const scripts = createRevoScripts({
      definitions: [gitScripts()],
      providers: nodeGitProviders({ processExecutor }),
      host,
    });
    const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
    const result = await scripts.execute(
      createGitScriptRequest(plan, {
        executionId: 'real-git-status',
        repositoryId: 'temporary-repository',
        workspaceId: 'temporary-workspace',
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 'workspace-change/v1',
        baseCapture: `git-commit:${headSha}`,
        headCapture: `git-tree:${expectedTree}`,
        changedPaths: [
          { path: 'tracked.txt', status: 'modified' },
          { path: 'untracked.txt', status: 'added' },
        ],
        clean: false,
      },
      evidence: [],
      attempts: 1,
    });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
