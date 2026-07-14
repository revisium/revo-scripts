import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import type {
  ProcessExecutionRequest,
  ProcessExecutor,
} from '../../../../src/providers/git/index.js';
import {
  createGitHost,
  createGitScriptRequest,
  gitTestHeadSha,
} from '../../../support/git/git-fixture.js';

test('executes built-in git status through the package-owned provider', async () => {
  const processRequests: ProcessExecutionRequest[] = [];
  const processExecutor: ProcessExecutor = {
    execute: async (request) => {
      processRequests.push(request);
      const operation = request.args[0];
      return {
        exitCode: 0,
        stdout:
          operation === 'status'
            ? [
                `# branch.oid ${gitTestHeadSha}`,
                '# branch.head master',
                `1 .M N... 100644 100644 100644 ${gitTestHeadSha} ${gitTestHeadSha} tracked.txt`,
                '? untracked.txt',
                '',
              ].join('\0')
            : operation === 'rev-parse' || operation === 'write-tree'
              ? gitTestHeadSha
              : '',
        stderr: '',
      };
    },
  };
  const workspaceRequests: string[] = [];
  const { events, host } = createGitHost({
    resolveWorkspace: async (workspaceId) => {
      workspaceRequests.push(workspaceId);
      return {
        workspaceId,
        repositoryId: 'repository-123',
        absolutePath: '/tmp/revo-worktree',
      };
    },
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({ processExecutor }),
    host,
  });

  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const provider = scripts.listProviderImplementations()[0];

  expect(provider).toBeDefined();
  expect(plan).toEqual({
    script: {
      id: 'script:git/status',
      version: '1.0.0',
      definitionDigest: plan.script.definitionDigest,
    },
    providers: [
      {
        name: 'git',
        resource: 'repository',
        id: 'provider:git/node',
        contract: 'revo.provider.git/v1',
        implementationDigest: provider?.implementationDigest,
        workspace: 'required',
        provenance: {
          packageName: '@revisium/revo-scripts',
          packageVersion: '0.0.0',
        },
      },
    ],
    manifest: plan.manifest,
  });

  const result = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'run-123:git-status:1',
    }),
  );

  expect(result).toEqual({
    ok: true,
    value: {
      schemaVersion: 'workspace-change/v1',
      baseCapture: `git-commit:${gitTestHeadSha}`,
      headCapture: `git-tree:${gitTestHeadSha}`,
      changedPaths: [
        { path: 'tracked.txt', status: 'modified' },
        { path: 'untracked.txt', status: 'untracked' },
      ],
      clean: false,
    },
    evidence: [],
    attempts: 1,
  });
  expect(workspaceRequests).toEqual(['workspace-456']);
  expect(
    processRequests.map((request) => ({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      maxOutputBytes: request.maxOutputBytes,
      hasTemporaryIndex: request.environment?.['GIT_INDEX_FILE'] !== undefined,
    })),
  ).toEqual([
    {
      command: 'git',
      args: ['status', '--porcelain=v2', '--branch', '-z'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      hasTemporaryIndex: false,
    },
    {
      command: 'git',
      args: ['rev-parse', 'HEAD'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      hasTemporaryIndex: false,
    },
    {
      command: 'git',
      args: ['read-tree', 'HEAD'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      hasTemporaryIndex: true,
    },
    {
      command: 'git',
      args: ['add', '-A'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      hasTemporaryIndex: true,
    },
    {
      command: 'git',
      args: ['write-tree'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      hasTemporaryIndex: true,
    },
  ]);
  expect(events.map((event) => event.name)).toEqual([
    'revo.script.started',
    'revo.script.succeeded',
  ]);
});
