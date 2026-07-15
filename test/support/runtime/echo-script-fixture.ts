import { z } from 'zod';

import { defineScript } from '../../../src/runtime/definition/define-script.js';
import { createScriptSchema } from '../../../src/runtime/definition/schema/create-script-schema.js';
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
  implementation: {
    id: '@revisium/revo-scripts/test/echo',
    version: '1.0.0',
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
  },
  handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
});
