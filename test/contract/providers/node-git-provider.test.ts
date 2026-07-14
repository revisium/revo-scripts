import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../src/index.js';
import { nodeGitProviders, type ProcessExecutor } from '../../../src/providers/git/index.js';

const execFileAsync = promisify(execFile);

const processExecutor: ProcessExecutor = async (request) => {
  const result = await execFileAsync(request.command, [...request.args], {
    cwd: request.cwd,
    encoding: 'utf8',
    maxBuffer: request.maxOutputBytes,
    signal: request.signal,
  });

  return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
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

    const scripts = createRevoScripts({
      definitions: [builtInScripts()],
      providers: nodeGitProviders({ processExecutor }),
      host: {
        workspaces: {
          resolve: async (workspaceId) => ({
            workspaceId,
            repositoryId: 'temporary-repository',
            absolutePath: repository,
          }),
        },
        credentials: {
          resolve: async () => {
            throw new Error('Git status must not request credentials.');
          },
        },
        events: { emit: async () => undefined },
      },
    });
    const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
    const result = await scripts.execute({
      executionId: 'real-git-status',
      script: plan.script,
      providers: plan.providers,
      input: {},
      bindings: {
        resources: {
          repository: {
            resourceId: 'target',
            kind: 'repository',
            repositoryId: 'temporary-repository',
            workspaceId: 'temporary-workspace',
            access: 'read',
            grant: { permissions: ['git.status.read'], effects: ['git.read'] },
            providerCoordinates: {},
          },
        },
        credentials: {},
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        branch: 'master',
        headSha,
        detached: false,
        stagedCount: 0,
        unstagedCount: 1,
        untrackedCount: 1,
        conflictedCount: 0,
        clean: false,
      },
      evidence: [],
      attempts: 1,
    });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
