import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects a workspace allocated for another repository before running Git', async () => {
  let processCalls = 0;
  const { host } = createGitHost({
    resolveWorkspace: async (workspaceId) => ({
      workspaceId,
      repositoryId: 'different-repository',
      absolutePath: '/tmp/revo-worktree',
    }),
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({
      processExecutor: {
        execute: async () => {
          processCalls += 1;
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  const result = await scripts.execute(
    createGitScriptRequest(plan, { executionId: 'workspace-mismatch' }),
  );

  expect({ result, processCalls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.workspace_mismatch',
        message: 'Resolved workspace does not match the resource binding.',
        retryable: false,
      },
      attempts: 0,
    },
    processCalls: 0,
  });
});
