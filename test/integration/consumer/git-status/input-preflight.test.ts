import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects invalid input before privileged host access', async () => {
  let workspaceCalls = 0;
  let processCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid input must fail before workspace resolution.');
    },
  });
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
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
    createGitScriptRequest(plan, {
      executionId: 'invalid-git-status-input',
      input: { unexpected: true },
    }),
  );

  expect({
    result,
    workspaceCalls,
    processCalls,
    eventNames: events.map((event) => event.name),
  }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
    processCalls: 0,
    eventNames: ['revo.script.failed'],
  });
});
