import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('rejects non-exact resource, permission and effect grants before host access', async () => {
  let processCalls = 0;
  let workspaceCalls = 0;
  const { host } = createGitHost({
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
  const valid = createGitScriptRequest(
    { id: 'script:git/status', version: 1 },
    { executionId: 'binding-matrix' },
  );
  const repository = valid.bindings.resources.repository;

  if (repository === undefined) {
    throw new Error('Expected the baseline repository binding.');
  }

  const results = await Promise.all([
    scripts.execute({
      ...valid,
      bindings: { ...valid.bindings, resources: {} },
    }),
    scripts.execute({
      ...valid,
      bindings: {
        ...valid.bindings,
        resources: { repository, unexpected: repository },
      },
    }),
    scripts.execute({
      ...valid,
      bindings: {
        ...valid.bindings,
        resources: { repository: { ...repository, access: 'write' } },
      },
    }),
    scripts.execute(
      createGitScriptRequest(
        { id: 'script:git/status', version: 1 },
        { executionId: 'binding-matrix', effects: [] },
      ),
    ),
    scripts.execute(
      createGitScriptRequest(
        { id: 'script:git/status', version: 1 },
        { executionId: 'binding-matrix', permissions: [] },
      ),
    ),
  ]);

  expect({ results, processCalls, workspaceCalls }).toEqual({
    results: [
      {
        ok: false,
        error: {
          code: 'revo.script.permission.resource',
          message: 'Resource bindings do not match the script manifest.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.resource',
          message: 'Resource bindings do not match the script manifest.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.resource',
          message: 'Resource binding repository does not match the manifest.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.effect',
          message: 'Resource binding repository is missing effect filesystem.read.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.grant',
          message: 'Resource binding repository is missing permission git.status.read.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    processCalls: 0,
    workspaceCalls: 0,
  });
});
