import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects non-JSON provider coordinates before privileged host access', async () => {
  let processCalls = 0;
  let workspaceCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid bindings must fail before workspace resolution.');
    },
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
    createGitScriptRequest(plan, {
      executionId: 'non-json-bindings',
      providerCoordinates: { revision: 1n },
    }),
  );

  expect({
    result,
    processCalls,
    workspaceCalls,
    eventNames: events.map((event) => event.name),
  }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script bindings must be JSON-compatible.',
        retryable: false,
      },
      attempts: 0,
    },
    processCalls: 0,
    workspaceCalls: 0,
    eventNames: ['revo.script.failed'],
  });
});
