import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import type { ProcessExecutor } from '../../../../src/providers/git/index.js';
import {
  createGitHost,
  createGitScriptRequest,
  gitTestHeadSha,
} from '../../../support/git/git-fixture.js';

test('executes built-in git status through the package-owned provider', async () => {
  const processRequests: Parameters<ProcessExecutor>[0][] = [];
  const processExecutor: ProcessExecutor = async (request) => {
    processRequests.push(request);
    return {
      exitCode: 0,
      stdout: [
        `# branch.oid ${gitTestHeadSha}`,
        '# branch.head master',
        `1 .M N... 100644 100644 100644 ${gitTestHeadSha} ${gitTestHeadSha} tracked.txt`,
        '? untracked.txt',
        '',
      ].join('\0'),
      stderr: '',
    };
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
    definitions: [builtInScripts()],
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
        id: 'provider:git/node/r1',
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
      branch: 'master',
      headSha: gitTestHeadSha,
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
  expect(workspaceRequests).toEqual(['workspace-456']);
  expect(processRequests).toEqual([
    {
      command: 'git',
      args: ['status', '--porcelain=v2', '--branch', '-z'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      signal: processRequests[0]?.signal,
    },
  ]);
  expect(events.map((event) => event.name)).toEqual([
    'revo.script.started',
    'revo.script.succeeded',
  ]);
});
