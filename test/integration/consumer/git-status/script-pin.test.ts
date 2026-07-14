import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects unknown script versions and definition digests before host access', async () => {
  let processCalls = 0;
  let workspaceCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid script pins must fail before workspace resolution.');
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
  const request = createGitScriptRequest(plan, { executionId: 'script-pin' });

  const results = await Promise.all([
    scripts.execute({
      ...request,
      script: { ...request.script, version: '2.0.0' },
    }),
    scripts.execute({
      ...request,
      script: { ...request.script, definitionDigest: `sha256:${'0'.repeat(64)}` },
    }),
  ]);

  expect({
    results,
    eventNames: events.map((event) => event.name),
    processCalls,
    workspaceCalls,
  }).toEqual({
    results: [
      {
        ok: false,
        error: {
          code: 'revo.script.execution.definition_missing',
          message: 'Script definition script:git/status@2.0.0 is not registered.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.execution.digest_mismatch',
          message: 'Script definition digest does not match the registered definition.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    eventNames: ['revo.script.failed', 'revo.script.failed'],
    processCalls: 0,
    workspaceCalls: 0,
  });
});
