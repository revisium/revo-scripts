import { expect, test } from 'vitest';

import type { PreparedProviderClients } from '../../../../src/host/index.js';
import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import {
  createGitHost,
  createGitScriptRequest,
  gitTestHeadSha,
  requireNodeGitProviderRegistration,
} from '../../../support/git/git-fixture.js';

test('disposes provider clients that finish preparing after execution is aborted', async () => {
  let releaseProvider: ((prepared: PreparedProviderClients) => void) | undefined;
  let markProviderStarted: (() => void) | undefined;
  let markDisposed: (() => void) | undefined;
  const providerGate = new Promise<PreparedProviderClients>((resolve) => {
    releaseProvider = resolve;
  });
  const providerStarted = new Promise<void>((resolve) => {
    markProviderStarted = resolve;
  });
  const disposed = new Promise<void>((resolve) => {
    markDisposed = resolve;
  });
  const baseRegistration = requireNodeGitProviderRegistration({
    processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  });
  const { host } = createGitHost();

  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: [
      {
        ...baseRegistration,
        module: {
          ...baseRegistration.module,
          createResourceClients: async () => {
            markProviderStarted?.();
            return providerGate;
          },
        },
      },
    ],
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const controller = new AbortController();
  const execution = scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'late-provider-preparation',
      signal: controller.signal,
    }),
  );

  await providerStarted;
  controller.abort(new Error('caller stopped the execution'));
  const result = await execution;
  releaseProvider?.({
    clients: {},
    dispose: async () => {
      markDisposed?.();
    },
  });
  await disposed;

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.execution.aborted',
      message: 'Script execution was aborted.',
      retryable: false,
    },
    attempts: 0,
  });
});

test('reports cleanup failure without publishing a success event', async () => {
  const baseRegistration = requireNodeGitProviderRegistration({
    processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  });
  const { events, host } = createGitHost();

  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: [
      {
        ...baseRegistration,
        module: {
          ...baseRegistration.module,
          createResourceClients: async () => ({
            clients: {
              git: {
                readStatus: async () => ({
                  branch: 'master',
                  headSha: gitTestHeadSha,
                  detached: false as const,
                  stagedCount: 0,
                  unstagedCount: 0,
                  untrackedCount: 0,
                  conflictedCount: 0,
                }),
              },
            },
            dispose: async () => {
              throw new Error('provider cleanup failed');
            },
          }),
        },
      },
    ],
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const result = await scripts.execute(
    createGitScriptRequest(plan, { executionId: 'cleanup-failure' }),
  );

  expect({ result, events: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.cleanup_failed',
        message: 'Provider resources could not be disposed safely.',
        retryable: false,
      },
      attempts: 1,
    },
    events: ['revo.script.started', 'revo.script.failed'],
  });
});
