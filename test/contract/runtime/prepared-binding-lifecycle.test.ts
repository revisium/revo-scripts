import { expect, test } from 'vitest';

import { createRevoScripts } from '../../../src/application/create-revo-scripts.js';
import type { ScriptProviderModule } from '../../../src/host/providers/script-provider-module.js';
import { defineScript } from '../../../src/runtime/definition/define-script.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

test('prepare inspects portable metadata and execution acquires and disposes live handles', async () => {
  const calls = {
    resourceInspect: 0,
    workspaceInspect: 0,
    workspaceAcquire: 0,
    credentialInspect: 0,
    credentialAcquire: 0,
    credentialDispose: 0,
    providerDispose: 0,
  };
  let acquiredRepositoryId = 'repo-1';
  let acquiredCredentialProvider = 'test';
  let credentialDisposeFails = false;
  const provider: ScriptProviderModule = {
    id: 'provider:test/lifecycle',
    contract: 'revo.provider.test/v1',
    implementationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000053',
    provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
    operations: ['git.read'],
    workspace: 'required',
    createResourceClients: async () => ({
      clients: {},
      dispose: async () => {
        calls.providerDispose += 1;
      },
    }),
  };
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/lifecycle',
      version: 1,
      summary: 'Exercises handle lifecycle.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'read',
      permissions: [],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      providers: [{ name: 'test', contract: 'revo.provider.test/v1', resource: 'repository' }],
      credentials: [{ name: 'token', provider: 'test', providerRequirement: 'test' }],
      operations: ['git.read'],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/lifecycle',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000054',
    },
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: definition.implementation.id,
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => registrar.register(definition),
      },
    ],
    providers: [{ module: provider }],
    host: {
      resources: {
        inspect: async () => {
          calls.resourceInspect += 1;
          return {
            resourceId: 'resource-1',
            kind: 'repository',
            repositoryId: acquiredRepositoryId,
            providerCoordinates: {},
            grant: { permissions: [], operations: ['git.read'] },
          };
        },
      },
      workspaces: {
        inspect: async () => {
          calls.workspaceInspect += 1;
          return { workspaceId: 'workspace-1', repositoryId: 'repo-1' };
        },
        acquire: async () => {
          calls.workspaceAcquire += 1;
          return {
            workspaceId: 'workspace-1',
            repositoryId: acquiredRepositoryId,
            absolutePath: '/private/workspace',
          };
        },
      },
      credentials: {
        inspect: async () => {
          calls.credentialInspect += 1;
          return { alias: 'credential:test', provider: 'test' };
        },
        acquire: async () => {
          calls.credentialAcquire += 1;
          return {
            alias: 'credential:test',
            provider: acquiredCredentialProvider,
            secret: 'top-secret',
            dispose: async () => {
              calls.credentialDispose += 1;
              if (credentialDisposeFails) {
                throw new Error('Mismatched credential lease could not be disposed.');
              }
            },
          };
        },
      },
    },
  });
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    {
      script: { id: definition.manifest.id, version: 1 },
      resources: { repository: { resourceRef: 'resource:test', workspaceRef: 'workspace-1' } },
      credentials: { token: 'credential:test' },
    },
    { signal: controller.signal },
  );

  expect(calls).toEqual({
    resourceInspect: 1,
    workspaceInspect: 1,
    workspaceAcquire: 0,
    credentialInspect: 1,
    credentialAcquire: 0,
    credentialDispose: 0,
    providerDispose: 0,
  });
  expect(JSON.stringify(binding)).not.toContain('/private/workspace');
  expect(JSON.stringify(binding)).not.toContain('top-secret');

  acquiredRepositoryId = 'repo-mismatch';
  await expect(
    scripts.executeAttempt(
      {
        executionId: 'run-workspace-mismatch',
        attemptId: 'attempt-workspace-mismatch',
        attemptOrdinal: 1,
        script: binding.script,
        binding,
        input: { message: 'blocked' },
      },
      { signal: controller.signal, events: { emit: async () => undefined } },
    ),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: { code: 'revo.script.provider.workspace_mismatch', stage: 'provider' },
  });
  expect(calls).toMatchObject({ workspaceAcquire: 1, credentialAcquire: 0, providerDispose: 0 });
  acquiredRepositoryId = 'repo-1';

  acquiredCredentialProvider = 'other';
  await expect(
    scripts.executeAttempt(
      {
        executionId: 'run-credential-mismatch',
        attemptId: 'attempt-credential-mismatch',
        attemptOrdinal: 1,
        script: binding.script,
        binding,
        input: { message: 'blocked' },
      },
      { signal: controller.signal, events: { emit: async () => undefined } },
    ),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: { code: 'revo.script.permission.credential', stage: 'acquire' },
  });
  expect(calls).toMatchObject({ credentialAcquire: 1, credentialDispose: 1, providerDispose: 0 });

  credentialDisposeFails = true;
  await expect(
    scripts.executeAttempt(
      {
        executionId: 'run-credential-cleanup-failure',
        attemptId: 'attempt-credential-cleanup-failure',
        attemptOrdinal: 1,
        script: binding.script,
        binding,
        input: { message: 'blocked' },
      },
      { signal: controller.signal, events: { emit: async () => undefined } },
    ),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.execution.cleanup',
      message: 'Provider resources could not be disposed safely.',
      retryable: false,
      stage: 'cleanup',
      details: null,
      causes: [{ kind: 'fault', code: 'revo.script.permission.credential', stage: 'acquire' }],
    },
    evidence: [],
  });
  expect(calls).toMatchObject({ credentialAcquire: 2, credentialDispose: 2, providerDispose: 0 });
  credentialDisposeFails = false;
  acquiredCredentialProvider = 'test';

  const result = await scripts.executeAttempt(
    {
      executionId: 'run-lifecycle',
      attemptId: 'attempt-lifecycle',
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'ok' },
    },
    { signal: controller.signal, events: { emit: async () => undefined } },
  );
  expect(result.kind).toBe('succeeded');
  expect(calls).toMatchObject({
    workspaceAcquire: 4,
    credentialAcquire: 3,
    credentialDispose: 3,
    providerDispose: 1,
  });

  // A completed attempt cannot re-acquire or re-dispose the physical handle.
  await expect(
    scripts.executeAttempt(
      {
        executionId: 'run-lifecycle',
        attemptId: 'attempt-lifecycle',
        attemptOrdinal: 1,
        script: binding.script,
        binding,
        input: { message: 'duplicate' },
      },
      { signal: controller.signal, events: { emit: async () => undefined } },
    ),
  ).rejects.toMatchObject({ code: 'revo.script.validation.attempt' });
  expect(calls).toMatchObject({ workspaceAcquire: 4, credentialAcquire: 3, providerDispose: 1 });
});
