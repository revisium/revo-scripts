import { expect, test } from 'vitest';

import { createRevoScripts, gitScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../../support/git/git-fixture.js';

const invalidRevisionFailure = {
  ok: false,
  error: {
    code: 'revo.script.validation.input',
    message: 'Script revision must be a positive safe integer.',
    retryable: false,
  },
  attempts: 0,
} as const;

test('rejects unknown script ids and revisions before host access without exposing a digest', async () => {
  let processCalls = 0;
  let workspaceCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid script pins must fail before workspace resolution.');
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
  const request = createGitScriptRequest(
    { id: 'script:git/status', version: 1 },
    { executionId: 'script-pin' },
  );

  const results = await Promise.all([
    scripts.execute({
      ...request,
      script: { ...request.script, id: 'script:git/unknown' },
    }),
    scripts.execute({
      ...request,
      script: { ...request.script, version: 2 },
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
          message: 'Script definition script:git/unknown@1 is not registered.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.execution.definition_missing',
          message: 'Script definition script:git/status@2 is not registered.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    eventNames: ['revo.script.failed', 'revo.script.failed'],
    processCalls: 0,
    workspaceCalls: 0,
  });
  expect(events.map((event) => Object.hasOwn(event.details ?? {}, 'definitionDigest'))).toEqual([
    false,
    false,
  ]);
});

test('rejects runtime revision aliases before workspace, credential, or provider access', async () => {
  let credentialCalls = 0;
  let processCalls = 0;
  let providerCalls = 0;
  let workspaceCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async (workspaceId) => {
      workspaceCalls += 1;
      return {
        workspaceId,
        repositoryId: 'repository-123',
        absolutePath: '/tmp/revo-worktree',
      };
    },
    resolveCredential: async () => {
      credentialCalls += 1;
      throw new Error('Invalid revisions must fail before credential resolution.');
    },
  });
  const registration = nodeGitProviders({
    processExecutor: {
      execute: async () => {
        processCalls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
  })[0];

  if (registration === undefined) {
    throw new Error('Expected the Git provider registration.');
  }

  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: [
      {
        module: {
          ...registration.module,
          createResourceClients: async (request) => {
            providerCalls += 1;
            return registration.module.createResourceClients(request);
          },
        },
      },
    ],
    host,
  });
  const invalidVersions: readonly unknown[] = ['1', 1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1];
  const results = await Promise.all(
    invalidVersions.map((version) => {
      const request = createGitScriptRequest(
        { id: 'script:git/status', version: 1 },
        { executionId: 'invalid-script-revision' },
      );
      Object.defineProperty(request.script, 'version', { value: version });
      return scripts.execute(request);
    }),
  );

  expect({ credentialCalls, processCalls, providerCalls, results, workspaceCalls }).toEqual({
    credentialCalls: 0,
    processCalls: 0,
    providerCalls: 0,
    results: invalidVersions.map(() => invalidRevisionFailure),
    workspaceCalls: 0,
  });
  expect(
    events.map((event) => ({
      executionId: event.details?.executionId,
      scriptId: event.details?.scriptId,
      scriptVersion: event.details?.scriptVersion,
      hasDefinitionDigest: Object.hasOwn(event.details ?? {}, 'definitionDigest'),
    })),
  ).toEqual(
    invalidVersions.map((scriptVersion) => ({
      executionId: 'invalid-script-revision',
      scriptId: 'script:git/status',
      scriptVersion,
      hasDefinitionDigest: false,
    })),
  );
});

test('validates execution identity before resolving an unknown script', async () => {
  let credentialCalls = 0;
  let processCalls = 0;
  let workspaceCalls = 0;
  const { events, host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Invalid execution identity must fail before workspace resolution.');
    },
    resolveCredential: async () => {
      credentialCalls += 1;
      throw new Error('Invalid execution identity must fail before credential resolution.');
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
  const request = createGitScriptRequest(
    { id: 'script:git/unknown', version: 1 },
    { executionId: '' },
  );
  const result = await scripts.execute(request);

  expect({ credentialCalls, processCalls, result, workspaceCalls }).toEqual({
    credentialCalls: 0,
    processCalls: 0,
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Execution id must contain between 1 and 256 Unicode code points.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    name: 'revo.script.failed',
    details: {
      executionId: '[INVALID_EXECUTION_ID]',
      scriptId: 'script:git/unknown',
      scriptVersion: 1,
      attempt: 0,
    },
  });
  expect(Object.hasOwn(events[0]?.details ?? {}, 'definitionDigest')).toBe(false);
});
