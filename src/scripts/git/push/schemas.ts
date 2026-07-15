import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import { gitChangeShape } from '../shared/git-change-schema.js';

export { gitChangeSchema as gitPushResultSchema } from '../shared/git-change-schema.js';

export const gitPushInputSchema = createScriptSchema({
  id: 'revo.script.git.push.input/v1',
  schema: z.strictObject({
    change: z.strictObject(gitChangeShape),
    expectedRemoteHead: z
      .string()
      .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
      .optional(),
  }),
  jsonSchema: 'input',
});
