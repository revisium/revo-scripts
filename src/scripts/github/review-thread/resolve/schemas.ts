import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import {
  githubObjectIdSchema,
  pullRequestNumberSchema,
  repositoryIdSchema,
} from '../../shared/schemas.js';

export { githubReviewThreadSchema as githubReviewThreadResolveResultSchema } from '../../shared/schemas.js';

export const githubReviewThreadResolveInputSchema = createScriptSchema({
  id: 'revo.script.github.review-thread.resolve.input/v1',
  schema: z.strictObject({
    repositoryId: repositoryIdSchema,
    pullRequestNumber: pullRequestNumberSchema,
    expectedHeadSha: githubObjectIdSchema,
    threadId: z.string().min(1).max(256),
  }),
  jsonSchema: 'input',
});
