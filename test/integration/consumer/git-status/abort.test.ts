import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects an already-aborted execution before privileged host access', async () => {
  let workspaceCalls = 0;
  const { host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Aborted execution must not resolve a workspace.');
    },
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({
      processExecutor: { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    }),
    host,
  });
  const controller = new AbortController();
  controller.abort(new Error('caller stopped the execution'));

  const result = await scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      {
        executionId: 'aborted-git-status',
        signal: controller.signal,
      },
    ),
  );

  expect({ result, workspaceCalls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.aborted',
        message: 'Script execution was aborted.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
});
