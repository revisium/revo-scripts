import { expect, test } from 'vitest';

import { createRevoScripts } from '../../../src/application/create-revo-scripts.js';
import { defineScript } from '../../../src/runtime/definition/define-script.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

test('executes a retryable failure once and returns it to the durable host', async () => {
  let calls = 0;
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/one-attempt',
      version: 1,
      summary: 'Fails once without package-owned retry scheduling.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'transient', maxAttempts: 3, backoffMs: [10, 20] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/one-attempt',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000049',
    },
    handler: {
      execute: async () => {
        calls += 1;
        throw new ScriptFault(
          'revo.script.provider.transient',
          'Provider is temporarily unavailable.',
          {
            retryable: true,
          },
        );
      },
    },
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: '@revisium/revo-scripts/test/one-attempt',
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => {
          registrar.register(definition);
        },
      },
    ],
    providers: [],
    host: {
      resources: { inspect: async () => undefined },
      workspaces: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('No workspace is required.');
        },
      },
      credentials: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('No credential is required.');
        },
      },
      clock: { now: () => 100, sleep: async () => undefined },
    },
  });

  const binding = await scripts.prepareBinding(
    { script: { id: 'script:test/one-attempt', version: 1 }, resources: {}, credentials: {} },
    { signal: new AbortController().signal },
  );
  const result = await scripts.executeAttempt(
    {
      executionId: 'operation-1',
      attemptId: 'attempt-1',
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'hello' },
    },
    { signal: new AbortController().signal, events: { emit: async () => undefined } },
  );

  expect({ calls, result, retry: binding.attemptPolicy.retry }).toMatchObject({
    calls: 1,
    result: {
      kind: 'failed',
      error: {
        code: 'revo.script.provider.transient',
        message: 'Provider is temporarily unavailable.',
        retryable: true,
        stage: 'provider',
        details: null,
        causes: [],
      },
      evidence: [],
    },
    retry: { mode: 'transient', maxAttempts: 3, backoffMs: [10, 20] },
  });
});
