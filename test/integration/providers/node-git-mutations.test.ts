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
import { createGitHost, executeGitScriptAttempt } from '../../support/git/git-fixture.js';

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

test(
  'commits an exact captured tree and publishes only that commit',
  // This fixture performs several real Git subprocess operations while the integration suite runs in parallel.
  { timeout: 30_000 },
  async () => {
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
        resource: {
          resourceId: 'target',
          repositoryId: 'temporary-repository',
          providerCoordinates: {},
          grant: {
            permissions: ['git.commit.write', 'git.push.publish'],
            operations: ['git.read', 'git.write', 'git.remote-write'],
          },
        },
        inspectWorkspace: async (workspaceId) => ({
          workspaceId,
          repositoryId: 'temporary-repository',
        }),
        acquireWorkspace: async (workspaceId) => ({
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
      const executeCommit = async (executionId: string) =>
        await executeGitScriptAttempt(
          scripts,
          { id: 'script:git/commit', version: 1 },
          {
            executionId,
            input: {
              resource: 'repository',
              remoteIdentity,
              branch: 'master',
              expectedParent: parent,
              expectedTree: capturedTree,
              title: 'exact tree',
              issueAction: 'none',
              author: {
                name: 'Revisium Bot',
                email: 'bot@revisium.io',
                timestamp: '2026-07-15T09:00:00.000Z',
              },
            },
            access: 'write',
            permissions: ['git.commit.write'],
            operations: ['git.read', 'git.write'],
            repositoryId: 'temporary-repository',
            workspaceId: 'temporary-workspace',
          },
        );
      const committed = await executeCommit('real-git-commit');
      if (committed.kind !== 'succeeded') {
        throw new Error('Expected the Git commit attempt to succeed.');
      }
      const committedValue = await gitCommitScript.resultSchema.validate(committed.value);
      if (!committedValue.ok) {
        throw new Error('Expected the Git commit result contract.');
      }
      const executePush = async (executionId: string) =>
        await executeGitScriptAttempt(
          scripts,
          { id: 'script:git/push', version: 1 },
          {
            executionId,
            input: { change: committedValue.value, expectedRemoteHead: parent },
            access: 'publish',
            permissions: ['git.push.publish'],
            operations: ['git.read', 'git.remote-write'],
            repositoryId: 'temporary-repository',
            workspaceId: 'temporary-workspace',
          },
        );
      const published = await executePush('real-git-push');

      expect({
        committed,
        published,
        remoteHead: await git(remote, ['rev-parse', 'refs/heads/master']),
      }).toMatchObject({
        committed: { kind: 'succeeded', value: committedValue.value, evidence: [] },
        published: { kind: 'succeeded', value: committedValue.value, evidence: [] },
        remoteHead: committedValue.value.headCommit,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
