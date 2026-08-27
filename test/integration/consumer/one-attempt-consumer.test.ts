import { expect, test } from 'vitest';

import { createRevoScripts, defineScript } from '../../../src/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

test('consumer prepares once and executes one physical attempt', async () => {
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/consumer-echo',
      version: 1,
      summary: 'Echoes a message.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      operations: [],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/consumer-echo',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000050',
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
    providers: [],
    host: {
      resources: { inspect: async () => undefined },
      workspaces: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
      credentials: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('not used');
        },
      },
    },
  });
  const controller = new AbortController();
  const binding = await scripts.prepareBinding(
    {
      script: { id: definition.manifest.id, version: definition.manifest.version },
      resources: {},
      credentials: {},
    },
    { signal: controller.signal },
  );

  const result = await scripts.executeAttempt(
    {
      executionId: 'run-42',
      attemptId: 'attempt-1',
      attemptOrdinal: 1,
      script: binding.script,
      binding,
      input: { message: 'hello' },
    },
    { signal: controller.signal, events: { emit: async () => undefined } },
  );

  expect(result).toMatchObject({
    kind: 'succeeded',
    value: { echoed: 'hello' },
    evidence: [],
    terminalEvent: { event: { name: 'revo.script.succeeded', details: { evidenceCount: 0 } } },
  });
});
