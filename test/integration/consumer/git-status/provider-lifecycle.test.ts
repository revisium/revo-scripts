import { expect, test, vi } from 'vitest';

import type { PreparedProviderClients } from '../../../../src/host/index.js';
import { createRevoScripts, gitScripts } from '../../../../src/index.js';
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
    processExecutor: {
      execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  });
  const { host } = createGitHost();

  const scripts = createRevoScripts({
    definitions: [gitScripts()],
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
  const controller = new AbortController();
  const execution = scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      {
        executionId: 'late-provider-preparation',
        signal: controller.signal,
      },
    ),
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
    processExecutor: {
      execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  });
  const { events, host } = createGitHost();

  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: [
      {
        ...baseRegistration,
        module: {
          ...baseRegistration.module,
          createResourceClients: async () => ({
            clients: {
              git: {
                readStatus: async () => ({
                  baseCapture: `git-commit:${gitTestHeadSha}` as const,
                  headCapture: `git-tree:${gitTestHeadSha}` as const,
                  changedPaths: [],
                  clean: true,
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
  const result = await scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      { executionId: 'cleanup-failure' },
    ),
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

test('preserves attempts when reporting cleanup failure also reaches a rejected event sink', async () => {
  const baseRegistration = requireNodeGitProviderRegistration({
    processExecutor: {
      execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    },
  });
  const { host } = createGitHost({
    onEvent: async (event) => {
      if (event.name === 'revo.script.failed') {
        throw new Error('event sink unavailable');
      }
    },
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: [
      {
        ...baseRegistration,
        module: {
          ...baseRegistration.module,
          createResourceClients: async () => ({
            clients: {
              git: {
                readStatus: async () => ({
                  baseCapture: `git-commit:${gitTestHeadSha}` as const,
                  headCapture: `git-tree:${gitTestHeadSha}` as const,
                  changedPaths: [],
                  clean: true,
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

  const result = await scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      { executionId: 'cleanup-and-event-failure' },
    ),
  );

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.execution.event_sink',
      message: 'Event sink rejected a script event.',
      retryable: false,
    },
    attempts: 1,
  });
});

test('bounds a provider cleanup operation that never settles', async () => {
  vi.useFakeTimers();

  try {
    const baseRegistration = requireNodeGitProviderRegistration({
      processExecutor: {
        execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      },
    });
    const { events, host } = createGitHost();
    const scripts = createRevoScripts({
      definitions: [gitScripts()],
      providers: [
        {
          ...baseRegistration,
          module: {
            ...baseRegistration.module,
            createResourceClients: async () => ({
              clients: {
                git: {
                  readStatus: async () => ({
                    baseCapture: `git-commit:${gitTestHeadSha}` as const,
                    headCapture: `git-tree:${gitTestHeadSha}` as const,
                    changedPaths: [],
                    clean: true,
                  }),
                },
              },
              dispose: async () => new Promise<void>(() => undefined),
            }),
          },
        },
      ],
      host,
    });
    const execution = scripts.execute(
      createGitScriptRequest(
        { id: 'script:git/status', version: 1 },
        { executionId: 'cleanup-timeout' },
      ),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await execution;

    expect({ result, events: events.map((event) => event.name) }).toEqual({
      result: {
        ok: false,
        error: {
          code: 'revo.script.provider.cleanup_failed',
          message: 'Provider cleanup exceeded its bounded grace period.',
          retryable: false,
        },
        attempts: 1,
      },
      events: ['revo.script.started', 'revo.script.failed'],
    });
  } finally {
    vi.useRealTimers();
  }
});
