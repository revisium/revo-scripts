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

  const provider = scripts.listProviderImplementations()[0];

  expect(provider).toBeDefined();
  expect(provider).toEqual({
    id: 'provider:git/node',
    contract: 'revo.provider.git/v1',
    implementationDigest: provider?.implementationDigest,
    workspace: 'required',
    effects: ['filesystem.read', 'git.read', 'git.write', 'git.remote-write'],
    provenance: {
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0',
    },
  });

  const result = await scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      {
        executionId: 'run-123:git-status:1',
      },
    ),
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
  expect(
    events.map((event) => {
      const digest = event.details?.definitionDigest;
      return {
        scriptId: event.details?.scriptId,
        scriptVersion: event.details?.scriptVersion,
        definitionDigestIsValid: typeof digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(digest),
      };
    }),
  ).toEqual([
    {
      scriptId: 'script:git/status',
      scriptVersion: 1,
      definitionDigestIsValid: true,
    },
    {
      scriptId: 'script:git/status',
      scriptVersion: 1,
      definitionDigestIsValid: true,
    },
  ]);
});
