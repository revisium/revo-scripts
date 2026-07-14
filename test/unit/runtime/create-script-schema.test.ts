import { expect, test } from 'vitest';
import { z } from 'zod';

import { createScriptSchema } from '../../../src/runtime/create-script-schema.js';

const messageSchema = z.strictObject({
  message: z.string().trim().min(1),
});

test('adapts Standard Schema validation without exposing the validation library', async () => {
  const schema = createScriptSchema({
    id: 'revo.script.test.message/v1',
    schema: messageSchema,
    jsonSchema: 'input',
  });

  await expect(schema.validate({ message: ' hello ' })).resolves.toEqual({
    ok: true,
    value: { message: 'hello' },
  });
  await expect(schema.validate({ message: '' })).resolves.toEqual({
    ok: false,
    issues: [
      {
        message: 'Too small: expected string to have >=1 characters',
        path: ['message'],
      },
    ],
  });
});

test('emits a closed Draft 2020-12 schema carrying the stable schema id', () => {
  const schema = createScriptSchema({
    id: 'revo.script.test.message/v1',
    schema: messageSchema,
    jsonSchema: 'input',
  });

  expect(schema.toJsonSchema()).toEqual({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'revo.script.test.message/v1',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['message'],
    additionalProperties: false,
  });
});
