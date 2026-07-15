import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import { gitObjectIdSchema } from '../shared/git-change-schema.js';

export { gitChangeSchema as gitCommitResultSchema } from '../shared/git-change-schema.js';

export const gitCommitInputSchema = createScriptSchema({
  id: 'revo.script.git.commit.input/v1',
  schema: z.strictObject({
    resource: z.string().min(1).max(256),
    remoteIdentity: z.string().min(1).max(512),
    branch: z.string().min(1).max(256),
    expectedParent: gitObjectIdSchema,
    expectedTree: gitObjectIdSchema,
    title: z.string().min(1).max(16_384),
    issueRef: z
      .strictObject({
        owner: z.string().min(1).max(100),
        repository: z.string().min(1).max(100),
        number: z.number().int().positive(),
        url: z.url().max(2_048),
      })
      .optional(),
    issueAction: z.enum(['close', 'refs', 'none']),
    author: z.strictObject({
      name: z.string().min(1).max(256),
      email: z.email().max(320),
      timestamp: z.iso.datetime({ offset: true }),
    }),
  }),
  jsonSchema: 'input',
});
