import { expect, test } from 'vitest';
import { z } from 'zod';

import { defineScript } from '../../../src/runtime/definition/define-script.js';
import { createScriptSchema } from '../../../src/runtime/definition/schema/create-script-schema.js';
import { createScriptRegistry } from '../../../src/runtime/registry/create-script-registry.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';

const emptySchema = createScriptSchema({
  id: 'revo.script.test.empty/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const createDefinition = (id: `script:test/${string}`, version: string) =>
  defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id,
      version,
      summary: `Test definition ${id}.`,
      inputSchemaId: emptySchema.id,
      resultSchemaId: emptySchema.id,
      effectClass: 'pure',
      permissions: [],
      resources: [],
      providers: [],
      credentials: [],
      effects: [],
      timeout: { wallClockMs: 1_000 },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: {
        inputPaths: [],
        resultPaths: [],
        errorPaths: [],
        eventPaths: [],
      },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: emptySchema,
    resultSchema: emptySchema,
    implementation: {
      id: '@revisium/revo-scripts/test/registry',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000006',
    },
    handler: { execute: async () => ({ value: {} }) },
  });

const captureFault = (operation: () => unknown) => {
  try {
    operation();
  } catch (error: unknown) {
    if (error instanceof ScriptFault) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
      };
    }

    throw error;
  }

  throw new Error('Expected operation to throw ScriptFault');
};

test('registers explicitly and resolves exact definitions only after sealing', () => {
  const alphaDefinition = createDefinition('script:test/alpha', '2.0.0');
  const zetaDefinition = createDefinition('script:test/zeta', '1.0.0');
  const registry = createScriptRegistry();
  const zeta = registry.register(zetaDefinition);
  const alpha = registry.register(alphaDefinition);

  expect(registry.listManifests()).toEqual([alphaDefinition.manifest, zetaDefinition.manifest]);
  expect(captureFault(() => registry.resolve(zeta.manifest.id, zeta.manifest.version))).toEqual({
    code: 'revo.script.execution.registry_not_sealed',
    message: 'Script registry must be sealed before lookup.',
    retryable: false,
    details: undefined,
  });

  registry.seal();

  expect({
    alpha: registry.getExact(alpha.manifest.id, alpha.manifest.version, alpha.definitionDigest),
    zeta: registry.resolve(zeta.manifest.id, zeta.manifest.version),
    publicHandleKeys: Object.keys(alpha).sort(),
  }).toEqual({
    alpha,
    zeta,
    publicHandleKeys: ['definitionDigest', 'implementation', 'manifest'],
  });
});

test('rejects duplicate registration and registration after sealing', () => {
  const definition = createDefinition('script:test/alpha', '1.0.0');
  const registry = createScriptRegistry();
  registry.register(definition);

  expect(captureFault(() => registry.register(definition))).toEqual({
    code: 'revo.script.execution.duplicate_definition',
    message: 'Script definition script:test/alpha@1.0.0 is already registered.',
    retryable: false,
    details: undefined,
  });

  registry.seal();

  expect(
    captureFault(() => registry.register(createDefinition('script:test/beta', '1.0.0'))),
  ).toEqual({
    code: 'revo.script.execution.registry_sealed',
    message: 'Script registry is sealed.',
    retryable: false,
    details: undefined,
  });
});

test('fails closed for missing definitions and digest mismatches', () => {
  const definition = createDefinition('script:test/alpha', '1.0.0');
  const registry = createScriptRegistry();
  registry.register(definition);
  registry.seal();

  expect(captureFault(() => registry.resolve('script:test/missing', '1.0.0'))).toEqual({
    code: 'revo.script.execution.definition_missing',
    message: 'Script definition script:test/missing@1.0.0 is not registered.',
    retryable: false,
    details: undefined,
  });
  expect(
    captureFault(() =>
      registry.getExact(
        definition.manifest.id,
        definition.manifest.version,
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ),
  ).toEqual({
    code: 'revo.script.execution.digest_mismatch',
    message: 'Script definition digest does not match the registered definition.',
    retryable: false,
    details: undefined,
  });
});
