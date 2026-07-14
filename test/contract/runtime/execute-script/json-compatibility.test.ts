import { expect, test } from 'vitest';
import { z } from 'zod';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import { createScriptSchema } from '../../../../src/runtime/definition/schema/create-script-schema.js';
import { echoDefinition, echoInputSchema } from '../../../support/runtime/echo-script-fixture.js';
import { executeRuntimeScenario } from '../../../support/runtime/runtime-mechanics.js';

test('rejects inputs without a finite JSON representation before handler invocation', async () => {
  let handlerCalls = 0;
  const definition = defineScript({
    ...echoDefinition,
    handler: {
      execute: async (input) => {
        handlerCalls += 1;
        return { value: { echoed: input.message } };
      },
    },
  });
  const circularInput: { message: string; self?: unknown } = { message: 'circular' };
  circularInput.self = circularInput;

  const executions = await Promise.all([
    executeRuntimeScenario(definition, {
      executionId: 'undefined-input',
      input: undefined,
      resources: {},
    }),
    executeRuntimeScenario(definition, {
      executionId: 'circular-input',
      input: circularInput,
      resources: {},
    }),
  ]);

  expect({
    results: executions.map(({ result }) => result),
    eventNames: executions.map(({ events }) => events.map((event) => event.name)),
    handlerCalls,
  }).toEqual({
    results: [
      {
        ok: false,
        error: {
          code: 'revo.script.validation.input',
          message: 'Script input must be JSON-compatible.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.validation.input',
          message: 'Script input must be JSON-compatible.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    eventNames: [['revo.script.failed'], ['revo.script.failed']],
    handlerCalls: 0,
  });
});

test('converts a non-JSON handler value into a structured result failure', async () => {
  const resultSchema = createScriptSchema({
    id: 'schema:test/non-json-result',
    schema: z.strictObject({ value: z.unknown() }),
    jsonSchema: 'output',
  });
  const definition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/non-json-result',
      resultSchemaId: resultSchema.id,
    },
    inputSchema: echoInputSchema,
    resultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/non-json-result',
      version: '1.0.0',
    },
    handler: {
      execute: async () => ({ value: { value: 1n } }),
    },
  });

  const { events, result } = await executeRuntimeScenario(definition, {
    executionId: 'non-json-result',
    input: { message: 'handled' },
    resources: {},
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.result',
        message: 'Script result must be JSON-compatible.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});
