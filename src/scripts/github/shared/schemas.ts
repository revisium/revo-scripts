import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const githubObjectIdSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const repositoryIdSchema = z.string().min(1).max(256);
export const pullRequestNumberSchema = z.number().int().positive();

export const githubPullRequestShape = {
  schemaVersion: z.literal('github-pull-request/v1'),
  repositoryId: repositoryIdSchema,
  number: pullRequestNumberSchema,
  pullRequestId: z.string().min(1).max(256),
  url: z.url().max(2_048),
  head: z.strictObject({ branch: z.string().min(1).max(256), sha: githubObjectIdSchema }),
  base: z.strictObject({ branch: z.string().min(1).max(256) }),
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  mergeCommitSha: githubObjectIdSchema.optional(),
};

export const githubPullRequestSchema = createScriptSchema({
  id: 'schema:githubPullRequest/v1',
  schema: z.strictObject(githubPullRequestShape),
  jsonSchema: 'output',
});

export const githubReadinessSchema = createScriptSchema({
  id: 'schema:githubReadiness/v1',
  schema: z.strictObject({
    schemaVersion: z.literal('github-readiness/v1'),
    repositoryId: repositoryIdSchema,
    pullRequestNumber: pullRequestNumberSchema,
    headSha: githubObjectIdSchema,
    ready: z.boolean(),
    blockers: z.array(z.string().min(1).max(512)).max(1_024),
  }),
  jsonSchema: 'output',
});

export const githubReviewThreadSchema = createScriptSchema({
  id: 'schema:githubReviewThread/v1',
  schema: z.strictObject({
    schemaVersion: z.literal('github-review-thread/v1'),
    repositoryId: repositoryIdSchema,
    pullRequestNumber: pullRequestNumberSchema,
    headSha: githubObjectIdSchema,
    threadId: z.string().min(1).max(256),
    replyId: z.string().min(1).max(256).optional(),
    resolved: z.boolean(),
  }),
  jsonSchema: 'output',
});
