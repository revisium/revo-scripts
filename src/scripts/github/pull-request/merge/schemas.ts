import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { githubPullRequestShape } from '../../shared/schemas.js';

export { githubPullRequestSchema as githubPullRequestMergeResultSchema } from '../../shared/schemas.js';

export const githubPullRequestMergeInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.merge.input/v1',
  schema: z.strictObject({
    pullRequest: z.strictObject(githubPullRequestShape),
    method: z.enum(['merge', 'squash', 'rebase']),
  }),
  jsonSchema: 'input',
});
