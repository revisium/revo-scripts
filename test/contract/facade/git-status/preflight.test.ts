import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

test('fails closed when an execution pin does not match the retained provider revision', async () => {
  const { host } = createGitHost({
    resolveWorkspace: async () => {
      throw new Error('Invalid pins must fail before workspace resolution.');
    },
    resolveCredential: async () => {
      throw new Error('Invalid pins must fail before credential resolution.');
    },
  });
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({
      processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const provider = plan.providers[0];

  if (provider === undefined) {
    throw new Error('Expected a Git provider pin in the resolved plan.');
  }

  const result = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'run-123:git-status:invalid-pin',
      providers: [
        {
          ...provider,
          implementationDigest: `sha256:${'0'.repeat(64)}`,
        },
      ],
    }),
  );

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.provider.pin_mismatch',
      message: 'Provider pin does not match a registered implementation.',
      retryable: false,
    },
    attempts: 0,
  });
});

test('validates grants and workspace bindings before constructing provider clients', async () => {
  let workspaceCalls = 0;
  let processCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async (workspaceId) => {
      workspaceCalls += 1;
      return {
        workspaceId,
        repositoryId: 'different-repository',
        absolutePath: '/tmp/revo-worktree',
      };
    },
    clock: {
      now: () => 1_000,
      sleep: async () => undefined,
    },
  });
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({
      processExecutor: async () => {
        processCalls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  const missingGrant = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'git-status-preflight',
      permissions: [],
    }),
  );
  const invalidInput = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'git-status-preflight',
      input: { unexpected: true },
    }),
  );
  const oversizedGrant = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'git-status-preflight',
      permissions: Array.from({ length: 65 }, (_, index) => `git.permission.${index}`),
    }),
  );
  const unsupportedCoordinates = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'git-status-preflight',
      providerCoordinates: { git: {} },
    }),
  );
  const controller = new AbortController();
  controller.abort(new Error('caller stopped the execution'));
  const aborted = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'git-status-preflight',
      signal: controller.signal,
    }),
  );
  const workspaceMismatch = await scripts.execute(
    createGitScriptRequest(plan, { executionId: 'git-status-preflight' }),
  );

  expect({
    aborted,
    invalidInput,
    missingGrant,
    oversizedGrant,
    unsupportedCoordinates,
    workspaceMismatch,
    workspaceCalls,
    processCalls,
  }).toEqual({
    aborted: {
      ok: false,
      error: {
        code: 'revo.script.execution.aborted',
        message: 'Script execution was aborted.',
        retryable: false,
      },
      attempts: 0,
    },
    invalidInput: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
      },
      attempts: 0,
    },
    missingGrant: {
      ok: false,
      error: {
        code: 'revo.script.permission.grant',
        message: 'Resource binding repository is missing permission git.status.read.',
        retryable: false,
      },
      attempts: 0,
    },
    oversizedGrant: {
      ok: false,
      error: {
        code: 'revo.script.validation.bindings',
        message: 'A resource grant exceeds the supported collection limits.',
        retryable: false,
      },
      attempts: 0,
    },
    unsupportedCoordinates: {
      ok: false,
      error: {
        code: 'revo.script.provider.coordinates_unsupported',
        message: 'Provider coordinates are not supported by the current facade slice.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceMismatch: {
      ok: false,
      error: {
        code: 'revo.script.provider.workspace_mismatch',
        message: 'Resolved workspace does not match the resource binding.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 1,
    processCalls: 0,
  });
  expect(
    events.map((event) => ({
      name: event.name,
      error:
        event.details !== undefined && 'error' in event.details ? event.details.error : undefined,
    })),
  ).toEqual([
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.permission.grant',
        message: 'Resource binding repository is missing permission git.status.read.',
        retryable: false,
      },
    },
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
      },
    },
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.validation.bindings',
        message: 'A resource grant exceeds the supported collection limits.',
        retryable: false,
      },
    },
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.provider.coordinates_unsupported',
        message: 'Provider coordinates are not supported by the current facade slice.',
        retryable: false,
      },
    },
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.execution.aborted',
        message: 'Script execution was aborted.',
        retryable: false,
      },
    },
    {
      name: 'revo.script.failed',
      error: {
        code: 'revo.script.provider.workspace_mismatch',
        message: 'Resolved workspace does not match the resource binding.',
        retryable: false,
      },
    },
  ]);
});
