import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import { gitObjectIdSchema } from '../shared/git-change-schema.js';

export { gitChangeSchema as gitCommitResultSchema } from '../shared/git-change-schema.js';

export const gitCommitInputSchema = createScriptSchema({
  id: 'revo.script.git.commit.input/v1',
  schema: z.strictObject({
    repositoryId: z.string().min(1).max(256),
    remoteIdentity: z.string().min(1).max(512),
    branch: z.string().min(1).max(256),
    expectedParent: gitObjectIdSchema,
    expectedTree: gitObjectIdSchema,
    message: z.string().min(1).max(16_384),
    authorship: z.strictObject({
      name: z
        .string()
        .min(1)
        .max(256)
        .refine(
          (value) =>
            !value.includes('\r') &&
            !value.includes('\n') &&
            !value.includes(String.fromCodePoint(0)),
        ),
      email: z.email().max(320),
      timestamp: z.iso.datetime({ offset: true }),
    }),
  }),
  jsonSchema: 'input',
});
