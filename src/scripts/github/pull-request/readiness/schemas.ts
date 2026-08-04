import { z } from 'zod';

import type { GitHubPullRequestReadinessClient } from '../../../../providers/github/index.js';
import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { ScriptSchemaOutput } from '../../../../runtime/spec/schema/index.js';
import { githubPullRequestShape, githubReadinessSchema } from '../../shared/schemas.js';

export const githubPullRequestReadinessResultSchema = githubReadinessSchema;

export const githubPullRequestReadinessInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.readiness.input/v1',
  schema: z.strictObject(githubPullRequestShape),
  jsonSchema: 'input',
});

export type GitHubPullRequestReadinessInput = ScriptSchemaOutput<
  typeof githubPullRequestReadinessInputSchema
>;
export type GitHubPullRequestReadinessResult = ScriptSchemaOutput<
  typeof githubPullRequestReadinessResultSchema
>;
export type GitHubPullRequestReadinessResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestReadinessClient }>>;
}>;
