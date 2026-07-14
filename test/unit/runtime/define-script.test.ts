import { expect, test } from 'vitest';

import { defineScript } from '../../../src/runtime/definition/define-script.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../../src/runtime/spec/manifest/index.js';
import type { ScriptSchema } from '../../../src/runtime/spec/schema/index.js';
import {
  echoHandler as handler,
  echoManifest as manifest,
  manualEchoInputSchema as inputSchema,
  manualEchoResultSchema as resultSchema,
} from '../../support/runtime/echo-definition-input.js';

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

test('defines one read-only script snapshot with a stable identity digest', () => {
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
    definitionDigest: 'sha256:d6d2ab007afc8982c38815b1055f220161fe64eafc44cb48cbd6dd36ec11a1bb',
    handler,
  });
  expect(definition.manifest).not.toBe(manifest);
});

test('rejects duplicate bounded manifest entries with stable diagnostics', () => {
  const invalidManifest = {
    ...manifest,
    effectClass: 'read',
    permissions: ['git.status.read', 'git.status.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    effects: ['git.read', 'git.read'],
  } as const satisfies ScriptManifestV1;

  const fault = captureFault(() =>
    defineScript({
      manifest: invalidManifest,
      inputSchema,
      resultSchema,
      implementation: {
        id: '@revisium/revo-scripts/test/echo',
        version: '1.0.0',
      },
      handler,
    }),
  );

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/permissions/1',
          message: 'Permission identifiers must be unique.',
        },
        {
          path: '/effects/1',
          message: 'Effects must be unique.',
        },
      ],
    },
  });
});

test('rejects incoherent effect, retry, and idempotency policies', () => {
  const invalidManifest = {
    ...manifest,
    permissions: ['git.status.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    effects: ['git.read'],
    retry: { mode: 'never', maxAttempts: 2, backoffMs: [10] },
    idempotency: 'required',
  } as const satisfies ScriptManifestV1;

  const fault = captureFault(() =>
    defineScript({
      manifest: invalidManifest,
      inputSchema,
      resultSchema,
      implementation: {
        id: '@revisium/revo-scripts/test/echo',
        version: '1.0.0',
      },
      handler,
    }),
  );

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/permissions',
          message: 'Pure scripts must not declare permissions.',
        },
        {
          path: '/resources',
          message: 'Pure scripts must not declare resources.',
        },
        {
          path: '/effects',
          message: 'Pure scripts must not declare effects.',
        },
        {
          path: '/retry',
          message: 'Retry mode never requires one attempt and no backoff.',
        },
        {
          path: '/idempotency',
          message: 'Required idempotency must declare a mutation effect.',
        },
      ],
    },
  });
});

test('rejects schema and implementation identities that diverge from the definition', () => {
  const invalidInputSchema: ScriptSchema<{ message: string }> = {
    ...inputSchema,
    id: 'revo.script.test.wrong.input/v1',
    toJsonSchema: () => ({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'revo.script.test.wrong.input/v1',
      type: 'object',
      properties: { message: { type: 'string' } },
      unknownKeyword: true,
    }),
  };

  const fault = captureFault(() =>
    defineScript({
      manifest,
      inputSchema: invalidInputSchema,
      resultSchema,
      implementation: {
        id: 'implementation with spaces',
        version: 'latest',
      },
      handler,
    }),
  );

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script definition is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/inputSchema/id',
          message: 'Input schema id must match manifest.inputSchemaId.',
        },
        {
          path: '/inputSchema/jsonSchema/$schema',
          message: 'JSON Schema must target Draft 2020-12.',
        },
        {
          path: '/inputSchema/jsonSchema/$id',
          message: 'JSON Schema $id must match manifest.inputSchemaId.',
        },
        {
          path: '/inputSchema/jsonSchema/additionalProperties',
          message: 'Object schemas must explicitly reject unknown properties.',
        },
        {
          path: '/inputSchema/jsonSchema',
          message: 'JSON Schema must compile under strict Draft 2020-12 validation.',
        },
        {
          path: '/implementation/id',
          message: 'Implementation id must be a stable namespaced identifier.',
        },
        {
          path: '/implementation/version',
          message: 'Implementation version must be an exact semantic version.',
        },
      ],
    },
  });
});

test('rejects nested object schemas that do not fail closed', () => {
  const nestedInputSchema: ScriptSchema<{ nested: { message: string } }> = {
    id: manifest.inputSchemaId,
    validate: async () => ({
      ok: true,
      value: { nested: { message: 'valid' } },
    }),
    toJsonSchema: () => ({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: manifest.inputSchemaId,
      type: 'object',
      additionalProperties: false,
      required: ['nested'],
      properties: {
        nested: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string' } },
        },
      },
    }),
  };

  const fault = captureFault(() =>
    defineScript({
      manifest,
      inputSchema: nestedInputSchema,
      resultSchema,
      implementation: {
        id: '@revisium/revo-scripts/test/nested-schema',
        version: '1.0.0',
      },
      handler: { execute: async () => ({ value: { echoed: 'valid' } }) },
    }),
  );

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script definition is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/inputSchema/jsonSchema/properties/nested/additionalProperties',
          message: 'Object schemas must explicitly reject unknown properties.',
        },
      ],
    },
  });
});

test('does not interpret JSON Schema annotation values as nested schemas', () => {
  const annotatedInputSchema: ScriptSchema<{ message: string }> = {
    ...inputSchema,
    toJsonSchema: () => ({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: manifest.inputSchemaId,
      type: 'object',
      additionalProperties: false,
      default: { type: 'object' },
      examples: [{ type: 'object' }],
      required: ['message'],
      properties: {
        message: { type: 'string', default: 'object' },
      },
    }),
  };

  const definition = defineScript({
    manifest,
    inputSchema: annotatedInputSchema,
    resultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/annotated-schema',
      version: '1.0.0',
    },
    handler,
  });

  expect(definition.manifest).toEqual(manifest);
});
