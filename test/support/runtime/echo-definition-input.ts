import type { ScriptManifestV1 } from '../../../src/core/spec/script-manifest.js';
import type { ScriptSchema } from '../../../src/core/spec/script-schema.js';

export const echoManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:test/echo',
  version: '1.0.0',
  summary: 'Returns the provided message.',
  inputSchemaId: 'revo.script.test.echo.input/v1',
  resultSchemaId: 'revo.script.test.echo.result/v1',
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
  events: {
    allowed: [],
    detailPaths: [],
  },
} as const satisfies ScriptManifestV1;

export const manualEchoInputSchema: ScriptSchema<{ message: string }> = {
  id: echoManifest.inputSchemaId,
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
    $id: echoManifest.inputSchemaId,
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: { message: { type: 'string' } },
  }),
};

export const manualEchoResultSchema: ScriptSchema<{ echoed: string }> = {
  id: echoManifest.resultSchemaId,
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
    $id: echoManifest.resultSchemaId,
    type: 'object',
    additionalProperties: false,
    required: ['echoed'],
    properties: { echoed: { type: 'string' } },
  }),
};

export const echoHandler = async ({ message }: Readonly<{ message: string }>) => ({
  value: { echoed: message },
});
