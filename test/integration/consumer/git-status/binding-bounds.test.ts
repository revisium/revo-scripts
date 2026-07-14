import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

const createBindingBoundsScenario = () => {
  let workspaceCalls = 0;
  const { host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid binding bounds must not resolve a workspace.');
    },
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({
      processExecutor: { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  return { scripts, plan, workspaceCalls: () => workspaceCalls };
};

test('rejects oversized grants before privileged host access', async () => {
  const scenario = createBindingBoundsScenario();

  const result = await scenario.scripts.execute(
    createGitScriptRequest(scenario.plan, {
      executionId: 'oversized-git-grant',
      permissions: Array.from({ length: 65 }, (_, index) => `git.permission.${index}`),
    }),
  );

  expect({ result, workspaceCalls: scenario.workspaceCalls() }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.bindings',
        message: 'A resource grant exceeds the supported collection limits.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
});

test('rejects duplicate grants before privileged host access', async () => {
  const scenario = createBindingBoundsScenario();

  const result = await scenario.scripts.execute(
    createGitScriptRequest(scenario.plan, {
      executionId: 'duplicate-git-grant',
      permissions: ['git.status.read', 'git.status.read'],
    }),
  );

  expect({ result, workspaceCalls: scenario.workspaceCalls() }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.bindings',
        message: 'Resource grant permissions and effects must be unique.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
});

test('rejects oversized provider collections before privileged host access', async () => {
  const scenario = createBindingBoundsScenario();
  const provider = scenario.plan.providers[0];

  if (provider === undefined) {
    throw new Error('Expected the Git provider pin.');
  }

  const result = await scenario.scripts.execute(
    createGitScriptRequest(scenario.plan, {
      executionId: 'oversized-provider-collection',
      providers: Array.from({ length: 9 }, () => provider),
    }),
  );

  expect({ result, workspaceCalls: scenario.workspaceCalls() }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.bindings',
        message: 'Execution bindings exceed the supported collection limits.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
});
