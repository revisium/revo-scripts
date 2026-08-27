import { z } from 'zod';

import type { GitHubPullRequestReadyClient } from '../../../../providers/github/index.js';
import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import type { ScriptResourceHandle } from '../../../../runtime/spec/resources/index.js';
import type { ScriptSchemaOutput } from '../../../../runtime/spec/schema/index.js';
import { githubPullRequestSchema, githubPullRequestShape } from '../../shared/schemas.js';

export const githubPullRequestMarkReadyResultSchema = githubPullRequestSchema;

export const githubPullRequestMarkReadyInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.mark-ready.input/v1',
  schema: z.strictObject({ pullRequest: z.strictObject(githubPullRequestShape) }),
  jsonSchema: 'input',
});

export type GitHubPullRequestMarkReadyInput = ScriptSchemaOutput<
  typeof githubPullRequestMarkReadyInputSchema
>;
export type GitHubPullRequestMarkReadyResult = ScriptSchemaOutput<
  typeof githubPullRequestMarkReadyResultSchema
>;
export type GitHubPullRequestMarkReadyResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ github: GitHubPullRequestReadyClient }>>;
}>;
