import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { githubObjectIdSchema, repositoryIdSchema } from '../../shared/schemas.js';

export { githubPullRequestSchema as githubPullRequestUpsertResultSchema } from '../../shared/schemas.js';

export const githubPullRequestUpsertInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.upsert.input/v1',
  schema: z.strictObject({
    repositoryId: repositoryIdSchema,
    head: z.strictObject({ branch: z.string().min(1).max(256), sha: githubObjectIdSchema }),
    base: z.strictObject({ branch: z.string().min(1).max(256) }),
    title: z.string().min(1).max(256),
    body: z.string().max(65_536),
    draft: z.boolean(),
  }),
  jsonSchema: 'input',
});
