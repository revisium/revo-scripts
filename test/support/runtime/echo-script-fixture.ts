import { z } from 'zod';

import { createScriptSchema } from '../../../src/core/runtime/create-script-schema.js';
import { defineScript } from '../../../src/core/runtime/define-script.js';
import { echoManifest } from './echo-definition-input.js';

export const echoInputSchema = createScriptSchema({
  id: echoManifest.inputSchemaId,
  schema: z.strictObject({ message: z.string() }),
  jsonSchema: 'input',
});

export const echoResultSchema = createScriptSchema({
  id: echoManifest.resultSchemaId,
  schema: z.strictObject({ echoed: z.string() }),
  jsonSchema: 'output',
});

export const echoDefinition = defineScript({
  manifest: echoManifest,
  inputSchema: echoInputSchema,
  resultSchema: echoResultSchema,
  implementation: { id: '@revisium/revo-scripts/test/echo', version: '1.0.0' },
  handler: async (input) => ({ value: { echoed: input.message } }),
});
