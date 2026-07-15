import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import {
  githubObjectIdSchema,
  pullRequestNumberSchema,
  repositoryIdSchema,
} from '../../shared/schemas.js';

export { githubReviewThreadSchema as githubReviewThreadRespondResultSchema } from '../../shared/schemas.js';

export const githubReviewThreadRespondInputSchema = createScriptSchema({
  id: 'revo.script.github.review-thread.respond.input/v1',
  schema: z.strictObject({
    repositoryId: repositoryIdSchema,
    pullRequestNumber: pullRequestNumberSchema,
    expectedHeadSha: githubObjectIdSchema,
    threadId: z.string().min(1).max(256),
    body: z.string().min(1).max(64_000),
  }),
  jsonSchema: 'input',
});
