import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../src/index.js';
import { nodeGitProviders, type ProcessExecutor } from '../../../src/providers/git/index.js';
import { gitCommitScript } from '../../../src/scripts/git/index.js';
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
const git = async (cwd: string, args: readonly string[]): Promise<string> =>
  (await execFileAsync('git', [...args], { cwd, encoding: 'utf8' })).stdout.trim();

test('commits an exact captured tree and publishes only that commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'revo-scripts-git-mutations-'));
  const repository = join(root, 'repository');
  const remote = join(root, 'remote.git');

  try {
    await git(root, ['init', '--bare', remote]);
    await git(root, ['init', '-b', 'master', repository]);
    await git(repository, ['config', 'user.name', 'Revo Scripts Test']);
    await git(repository, ['config', 'user.email', 'revo-scripts@example.test']);
    await git(repository, ['remote', 'add', 'origin', pathToFileURL(remote).href]);
    await writeFile(join(repository, 'tracked.txt'), 'initial\n');
    await git(repository, ['add', 'tracked.txt']);
    await git(repository, ['commit', '-m', 'initial']);
    await git(repository, ['push', 'origin', 'master']);
    const parent = await git(repository, ['rev-parse', 'HEAD']);
    await writeFile(join(repository, 'tracked.txt'), 'changed\n');
    const expectedTree = await git(repository, ['write-tree']);
    await git(repository, ['add', '-A']);
    const capturedTree = await git(repository, ['write-tree']);
    expect(capturedTree).not.toEqual(expectedTree);

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
    const remoteIdentity = pathToFileURL(remote).href;
    const commitPlan = scripts.resolveForPlan({ id: 'script:git/commit', version: '1.0.0' });
    const executeCommit = async (executionId: string) =>
      await scripts.execute(
        createGitScriptRequest(commitPlan, {
          executionId,
          input: {
            repositoryId: 'temporary-repository',
            remoteIdentity,
            branch: 'master',
            expectedParent: parent,
            expectedTree: capturedTree,
            message: 'feat: exact tree',
            authorship: {
              name: 'Revo Scripts',
              email: 'revo-scripts@example.test',
              timestamp: '2026-07-14T00:00:00Z',
            },
          },
          access: 'write',
          permissions: ['git.commit.write'],
          effects: ['git.read', 'git.write'],
          repositoryId: 'temporary-repository',
          workspaceId: 'temporary-workspace',
          idempotencyKey: 'git-commit-operation',
        }),
      );
    const committed = await executeCommit('real-git-commit');
    if (!committed.ok) {
      throw new Error(committed.error.message);
    }
    const committedValue = await gitCommitScript.resultSchema.validate(committed.value);
    if (!committedValue.ok) {
      throw new Error('Expected the Git commit result contract.');
    }
    await git(repository, [
      'update-ref',
      'refs/heads/master',
      parent,
      committedValue.value.headCommit,
    ]);
    await git(repository, ['config', 'user.name', 'Changed Ambient Identity']);
    const commitReplay = await executeCommit('real-git-commit-replay');
    const pushPlan = scripts.resolveForPlan({ id: 'script:git/push', version: '1.0.0' });
    const executePush = async (executionId: string) =>
      await scripts.execute(
        createGitScriptRequest(pushPlan, {
          executionId,
          input: { change: committedValue.value },
          access: 'publish',
          permissions: ['git.push.publish'],
          effects: ['git.read', 'git.remote-write'],
          repositoryId: 'temporary-repository',
          workspaceId: 'temporary-workspace',
          idempotencyKey: 'git-push-operation',
        }),
      );
    const published = await executePush('real-git-push');
    const pushReplay = await executePush('real-git-push-replay');

    expect({
      committed,
      commitReplay,
      published,
      pushReplay,
      remoteHead: await git(remote, ['rev-parse', 'refs/heads/master']),
    }).toEqual({
      committed: { ok: true, value: committedValue.value, evidence: [], attempts: 1 },
      commitReplay: { ok: true, value: committedValue.value, evidence: [], attempts: 1 },
      published: { ok: true, value: committedValue.value, evidence: [], attempts: 1 },
      pushReplay: { ok: true, value: committedValue.value, evidence: [], attempts: 1 },
      remoteHead: committedValue.value.headCommit,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
