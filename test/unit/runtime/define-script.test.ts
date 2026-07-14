import { expect, test } from 'vitest';

import { defineScript } from '../../../src/runtime/define-script.js';
import type { ScriptManifestV1 } from '../../../src/spec/script-manifest.js';
import type { ScriptSchema } from '../../../src/spec/script-schema.js';

const manifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:test/echo',
  version: '1.0.0',
  summary: 'Returns the provided message.',
  inputSchemaId: 'revo.script.test.echo.input/v1',
  resultSchemaId: 'revo.script.test.echo.result/v1',
  effectClass: 'pure',
  permissions: [],
  resources: [],
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
  events: {
    allowed: [],
    detailPaths: [],
  },
} as const satisfies ScriptManifestV1;

const inputSchema: ScriptSchema<{ message: string }> = {
  id: manifest.inputSchemaId,
  validate: async (value) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 1 &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      return { ok: true, value: { message: value.message } };
    }

    return { ok: false, issues: [{ message: 'Expected one message string.', path: [] }] };
  },
  toJsonSchema: () => ({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: manifest.inputSchemaId,
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: { message: { type: 'string' } },
  }),
};

const resultSchema: ScriptSchema<{ echoed: string }> = {
  id: manifest.resultSchemaId,
  validate: async (value) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 1 &&
      'echoed' in value &&
      typeof value.echoed === 'string'
    ) {
      return { ok: true, value: { echoed: value.echoed } };
    }

    return { ok: false, issues: [{ message: 'Expected one echoed string.', path: [] }] };
  },
  toJsonSchema: () => ({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: manifest.resultSchemaId,
    type: 'object',
    additionalProperties: false,
    required: ['echoed'],
    properties: { echoed: { type: 'string' } },
  }),
};

const handler = async ({ message }: Readonly<{ message: string }>) => ({
  value: { echoed: message },
});

test('defines one immutable script with a stable identity digest', () => {
  const definition = defineScript({
    manifest,
    inputSchema,
    resultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/echo',
      version: '1.0.0',
    },
    handler,
  });

  expect(definition).toEqual({
    manifest,
    inputSchema,
    resultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/echo',
      version: '1.0.0',
    },
    definitionDigest: 'sha256:ef30b321c33cc8dca9905acec67a657df388545123b8ad4b4761c8ec086ba3f2',
    handler,
  });
  expect({
    definition: Object.isFrozen(definition),
    manifest: Object.isFrozen(definition.manifest),
    implementation: Object.isFrozen(definition.implementation),
  }).toEqual({
    definition: true,
    manifest: true,
    implementation: true,
  });
});
