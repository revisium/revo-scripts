import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { githubPullRequestShape } from '../../shared/schemas.js';

export { githubPullRequestSchema as githubPullRequestMarkReadyResultSchema } from '../../shared/schemas.js';

export const githubPullRequestMarkReadyInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.mark-ready.input/v1',
  schema: z.strictObject({ pullRequest: z.strictObject(githubPullRequestShape) }),
  jsonSchema: 'input',
});
