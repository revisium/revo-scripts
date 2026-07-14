import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import {
  githubObjectIdSchema,
  pullRequestNumberSchema,
  repositoryIdSchema,
} from '../../shared/schemas.js';

export { githubReadinessSchema as githubPullRequestReadinessResultSchema } from '../../shared/schemas.js';

export const githubPullRequestReadinessInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.readiness.input/v1',
  schema: z.strictObject({
    repositoryId: repositoryIdSchema,
    pullRequestNumber: pullRequestNumberSchema,
    expectedHeadSha: githubObjectIdSchema,
  }),
  jsonSchema: 'input',
});
