import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const githubObjectIdSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const repositoryIdSchema = z.string().min(1).max(256);
export const pullRequestNumberSchema = z.number().int().positive();
const issueAction = z.enum(['close', 'refs', 'none']);
const providerRevision = z.string().regex(/^github-pr-metadata\/v1:sha256:[0-9a-f]{64}$/);

export const githubPullRequestShape = {
  schemaVersion: z.literal('github-pull-request/v1'),
  repositoryId: repositoryIdSchema,
  owner: z.string().min(1).max(100),
  repository: z.string().min(1).max(100),
  number: pullRequestNumberSchema,
  pullRequestId: z.string().min(1).max(256),
  url: z.url().max(2_048),
  head: z.strictObject({ branch: z.string().min(1).max(256), sha: githubObjectIdSchema }),
  base: z.strictObject({ branch: z.string().min(1).max(256) }),
  providerRevision,
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  issueRef: z
    .strictObject({
      owner: z.string().min(1).max(100),
      repository: z.string().min(1).max(100),
      number: pullRequestNumberSchema,
      action: issueAction,
    })
    .optional(),
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
    pullRequest: z.strictObject({
      owner: z.string().min(1).max(100),
      repository: z.string().min(1).max(100),
      number: pullRequestNumberSchema,
      url: z.url().max(2_048),
    }),
    observedAt: z.iso.datetime({ offset: true }),
    providerRevision: z.string().min(1).max(512),
    headCommit: githubObjectIdSchema,
    state: z.enum(['open', 'closed', 'merged']),
    draft: z.boolean(),
    mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
    mergeState: z.string().min(1).max(128),
    checks: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(256),
          required: z.boolean(),
          status: z.string().min(1).max(64),
          conclusion: z.string().min(1).max(64).optional(),
        }),
      )
      .max(100),
    unresolvedThreads: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(256),
          url: z.url().max(2_048).optional(),
          outdated: z.boolean(),
        }),
      )
      .max(100),
    completeness: z.strictObject({
      checks: z.enum(['complete', 'unavailable', 'truncated']),
      requiredChecks: z.enum(['complete', 'unavailable', 'truncated']),
      threads: z.enum(['complete', 'truncated']),
    }),
    advisory: z.array(z.string().min(1).max(512)).max(100),
    classification: z.enum([
      'clean',
      'recheck',
      'ci_changes',
      'review_changes',
      'closed',
      'merged',
      'unclassifiable',
    ]),
  }),
  jsonSchema: 'output',
});
