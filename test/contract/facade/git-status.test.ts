import { test, expect } from 'vitest';

import type { ScriptEvent } from '../../../src/core/spec/script-events.js';
import type { PreparedProviderClients } from '../../../src/host/index.js';
import { builtInScripts, createRevoScripts } from '../../../src/index.js';
import { nodeGitProviders, type ProcessExecutor } from '../../../src/providers/git/index.js';

const headSha = '0123456789abcdef0123456789abcdef01234567';

test('executes built-in git status through the package-owned provider', async () => {
  const processRequests: Parameters<ProcessExecutor>[0][] = [];
  const processExecutor: ProcessExecutor = async (request) => {
    processRequests.push(request);
    return {
      exitCode: 0,
      stdout: [
        `# branch.oid ${headSha}`,
        '# branch.head master',
        `1 .M N... 100644 100644 100644 ${headSha} ${headSha} tracked.txt`,
        '? untracked.txt',
        '',
      ].join('\0'),
      stderr: '',
    };
  };
  const events: ScriptEvent[] = [];
  const workspaceRequests: string[] = [];
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({ processExecutor }),
    host: {
      workspaces: {
        resolve: async (workspaceId) => {
          workspaceRequests.push(workspaceId);
          return {
            workspaceId,
            repositoryId: 'repository-123',
            absolutePath: '/tmp/revo-worktree',
          };
        },
      },
      credentials: {
        resolve: async () => {
          throw new Error('Git status must not resolve credentials.');
        },
      },
      events: {
        emit: async (event) => {
          events.push(event);
        },
      },
    },
  });

  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const provider = scripts.listProviderImplementations()[0];

  expect(provider).toBeDefined();
  expect(plan).toEqual({
    script: {
      id: 'script:git/status',
      version: '1.0.0',
      definitionDigest: plan.script.definitionDigest,
    },
    providers: [
      {
        name: 'git',
        resource: 'repository',
        id: 'provider:git/node/r1',
        contract: 'revo.provider.git/v1',
        implementationDigest: provider?.implementationDigest,
        workspace: 'required',
        provenance: {
          packageName: '@revisium/revo-scripts',
          packageVersion: '0.0.0',
        },
      },
    ],
    manifest: plan.manifest,
  });

  const result = await scripts.execute({
    executionId: 'run-123:git-status:1',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read',
          grant: {
            permissions: ['git.status.read'],
            effects: ['git.read'],
          },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  });

  expect(result).toEqual({
    ok: true,
    value: {
      branch: 'master',
      headSha,
      detached: false,
      stagedCount: 0,
      unstagedCount: 1,
      untrackedCount: 1,
      conflictedCount: 0,
      clean: false,
    },
    evidence: [],
    attempts: 1,
  });
  expect(workspaceRequests).toEqual(['workspace-456']);
  expect(processRequests).toEqual([
    {
      command: 'git',
      args: ['status', '--porcelain=v2', '--branch', '-z'],
      cwd: '/tmp/revo-worktree',
      maxOutputBytes: 1_048_576,
      signal: processRequests[0]?.signal,
    },
  ]);
  expect(events.map((event) => event.name)).toEqual([
    'revo.script.started',
    'revo.script.succeeded',
  ]);
});

test('fails closed when an execution pin does not match the retained provider revision', async () => {
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({
      processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    }),
    host: {
      workspaces: {
        resolve: async () => {
          throw new Error('Invalid pins must fail before workspace resolution.');
        },
      },
      credentials: {
        resolve: async () => {
          throw new Error('Invalid pins must fail before credential resolution.');
        },
      },
      events: { emit: async () => undefined },
    },
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const provider = plan.providers[0];

  expect(provider).toBeDefined();

  const result = await scripts.execute({
    executionId: 'run-123:git-status:invalid-pin',
    script: plan.script,
    providers: [
      {
        ...provider!,
        implementationDigest: `sha256:${'0'.repeat(64)}`,
      },
    ],
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read',
          grant: {
            permissions: ['git.status.read'],
            effects: ['git.read'],
          },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  });

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
  const events: ScriptEvent[] = [];
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({
      processExecutor: async () => {
        processCalls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    }),
    host: {
      workspaces: {
        resolve: async (workspaceId) => {
          workspaceCalls += 1;
          return {
            workspaceId,
            repositoryId: 'different-repository',
            absolutePath: '/tmp/revo-worktree',
          };
        },
      },
      credentials: {
        resolve: async () => {
          throw new Error('Git status must not resolve credentials.');
        },
      },
      events: {
        emit: async (event) => {
          events.push(event);
        },
      },
      clock: {
        now: () => 1_000,
        sleep: async () => undefined,
      },
    },
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const createRequest = (grant: {
    readonly permissions: readonly string[];
    readonly effects: readonly 'git.read'[];
  }) => ({
    executionId: 'git-status-preflight',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository' as const,
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read' as const,
          grant,
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  });

  const missingGrant = await scripts.execute(
    createRequest({ permissions: [], effects: ['git.read'] }),
  );
  const invalidInput = await scripts.execute({
    ...createRequest({ permissions: ['git.status.read'], effects: ['git.read'] }),
    input: { unexpected: true },
  });
  const oversizedGrant = await scripts.execute(
    createRequest({
      permissions: Array.from({ length: 65 }, (_, index) => `git.permission.${index}`),
      effects: ['git.read'],
    }),
  );
  const coordinateRequest = createRequest({
    permissions: ['git.status.read'],
    effects: ['git.read'],
  });
  const unsupportedCoordinates = await scripts.execute({
    ...coordinateRequest,
    bindings: {
      ...coordinateRequest.bindings,
      resources: {
        repository: {
          ...coordinateRequest.bindings.resources.repository,
          providerCoordinates: { git: {} },
        },
      },
    },
  });
  const controller = new AbortController();
  controller.abort(new Error('caller stopped the execution'));
  const aborted = await scripts.execute({
    ...createRequest({ permissions: ['git.status.read'], effects: ['git.read'] }),
    signal: controller.signal,
  });
  const workspaceMismatch = await scripts.execute(
    createRequest({ permissions: ['git.status.read'], effects: ['git.read'] }),
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
  const baseRegistration = nodeGitProviders({
    processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  })[0];

  if (baseRegistration === undefined) {
    throw new Error('Expected the retained Git provider revision.');
  }

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
    host: {
      workspaces: {
        resolve: async (workspaceId) => ({
          workspaceId,
          repositoryId: 'repository-123',
          absolutePath: '/tmp/revo-worktree',
        }),
      },
      credentials: {
        resolve: async () => {
          throw new Error('Git status must not resolve credentials.');
        },
      },
      events: { emit: async () => undefined },
    },
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const controller = new AbortController();
  const execution = scripts.execute({
    executionId: 'late-provider-preparation',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read',
          grant: { permissions: ['git.status.read'], effects: ['git.read'] },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
    signal: controller.signal,
  });

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
  const events: ScriptEvent[] = [];
  const baseRegistration = nodeGitProviders({
    processExecutor: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  })[0];

  if (baseRegistration === undefined) {
    throw new Error('Expected the retained Git provider revision.');
  }

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
                  headSha,
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
    host: {
      workspaces: {
        resolve: async (workspaceId) => ({
          workspaceId,
          repositoryId: 'repository-123',
          absolutePath: '/tmp/revo-worktree',
        }),
      },
      credentials: {
        resolve: async () => {
          throw new Error('Git status must not resolve credentials.');
        },
      },
      events: {
        emit: async (event) => {
          events.push(event);
        },
      },
    },
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });
  const result = await scripts.execute({
    executionId: 'cleanup-failure',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read',
          grant: { permissions: ['git.status.read'], effects: ['git.read'] },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  });

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
