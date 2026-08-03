import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const echoInputSchema = createScriptSchema({
  id: 'revo.script.system.echo.input/v1',
  schema: z.strictObject({ message: z.string().max(65_536) }),
  jsonSchema: 'input',
});

export const echoResultSchema = createScriptSchema({
  id: 'revo.script.system.echo.result/v1',
  schema: z.strictObject({ message: z.string().max(65_536) }),
  jsonSchema: 'output',
});
