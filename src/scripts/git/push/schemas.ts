import { z } from 'zod';

import type { GitPushClient } from '../../../providers/git/index.js';
import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';
import type { ScriptSchemaOutput } from '../../../runtime/spec/schema/index.js';
import { gitChangeSchema, gitChangeShape } from '../shared/git-change-schema.js';

export const gitPushResultSchema = gitChangeSchema;

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

export type GitPushInput = ScriptSchemaOutput<typeof gitPushInputSchema>;
export type GitPushResult = ScriptSchemaOutput<typeof gitPushResultSchema>;
export type GitPushResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitPushClient }>>;
}>;
