import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects every mutable provider pin field before privileged host access', async () => {
  let processCalls = 0;
  let workspaceCalls = 0;
  const { host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid provider pins must fail before workspace resolution.');
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
  const provider = plan.providers[0];

  if (provider === undefined) {
    throw new Error('Expected the resolved Git provider pin.');
  }

  const manifestMismatch = {
    ok: false,
    error: {
      code: 'revo.script.provider.pin_mismatch',
      message: 'Provider pin does not match the script manifest.',
      retryable: false,
    },
    attempts: 0,
  } as const;
  const implementationMismatch = {
    ok: false,
    error: {
      code: 'revo.script.provider.pin_mismatch',
      message: 'Provider pin does not match a registered implementation.',
      retryable: false,
    },
    attempts: 0,
  } as const;
  const executeWithProvider = (replacement: typeof provider) =>
    scripts.execute(
      createGitScriptRequest(plan, {
        executionId: 'provider-pin',
        providers: [replacement],
      }),
    );

  const results = await Promise.all([
    executeWithProvider({ ...provider, name: 'other' }),
    executeWithProvider({ ...provider, resource: 'other' }),
    executeWithProvider({ ...provider, contract: 'revo.provider.git/v2' }),
    executeWithProvider({ ...provider, id: 'provider:git/other' }),
    executeWithProvider({ ...provider, implementationDigest: `sha256:${'0'.repeat(64)}` }),
    executeWithProvider({ ...provider, workspace: 'none' }),
    executeWithProvider({
      ...provider,
      provenance: { ...provider.provenance, packageVersion: 'other' },
    }),
  ]);

  expect({ results, processCalls, workspaceCalls }).toEqual({
    results: [
      manifestMismatch,
      manifestMismatch,
      manifestMismatch,
      implementationMismatch,
      implementationMismatch,
      implementationMismatch,
      implementationMismatch,
    ],
    processCalls: 0,
    workspaceCalls: 0,
  });
});
