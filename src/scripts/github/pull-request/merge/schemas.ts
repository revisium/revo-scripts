import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { mergeGateResolutionArtifactSchema } from '../../../approval/contracts/gate-resolution-schemas.js';
import { approvalSubjectResultShape } from '../../../approval/subject/schemas.js';
import {
  githubObjectIdSchema,
  githubPullRequestShape,
  pullRequestNumberSchema,
  repositoryIdSchema,
} from '../../shared/schemas.js';

export const githubPullRequestMergeResultSchema = createScriptSchema({
  id: 'schema:githubPullRequestMergeResult/v1',
  schema: z.strictObject({
    schemaVersion: z.literal('github-pull-request-merge-result/v1'),
    repositoryId: repositoryIdSchema,
    owner: z.string().min(1).max(100),
    repository: z.string().min(1).max(100),
    number: pullRequestNumberSchema,
    pullRequestId: z.string().min(1).max(256),
    url: z.url().max(2_048),
    approvedHeadCommit: githubObjectIdSchema,
    mergedHeadCommit: githubObjectIdSchema,
    mergeCommit: githubObjectIdSchema.optional(),
    method: z.literal('squash'),
    status: z.enum(['merged', 'already-merged']),
    sourceBranchDeleted: z.literal(true),
    issueRef: z
      .strictObject({
        owner: z.string().min(1).max(100),
        repository: z.string().min(1).max(100),
        number: pullRequestNumberSchema,
        action: z.enum(['close', 'refs']),
      })
      .optional(),
    override: z
      .strictObject({
        actor: z.string().min(1),
        auditFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        threadIds: z.array(z.string()).max(100),
      })
      .optional(),
  }),
  jsonSchema: 'output',
});

export const githubPullRequestMergeInputSchema = createScriptSchema({
  id: 'revo.script.github.pull-request.merge.input/v1',
  schema: z.strictObject({
    pullRequest: z.strictObject(githubPullRequestShape),
    approvalSubject: z.strictObject({
      ...approvalSubjectResultShape,
      kind: z.enum(['publication', 'operation']),
      identity: z.strictObject({ scheme: z.literal('uri'), value: z.string().min(1) }),
      revision: z.strictObject({
        scheme: z.literal('git-commit'),
        value: z.string().regex(/^[0-9a-f]{40}$/),
      }),
    }),
    gateResolution: mergeGateResolutionArtifactSchema,
    readiness: z.strictObject({
      schemaVersion: z.literal('github-readiness/v1'),
      repositoryId: z.string(),
      pullRequest: z.strictObject({
        owner: z.string(),
        repository: z.string(),
        number: z.number().int().positive(),
        url: z.url(),
      }),
      observedAt: z.iso.datetime({ offset: true }),
      providerRevision: z.string(),
      headCommit: z.string().regex(/^[0-9a-f]{40}$/),
      state: z.enum(['open', 'closed', 'merged']),
      draft: z.boolean(),
      mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
      mergeState: z.string(),
      checks: z.array(
        z.strictObject({
          name: z.string(),
          required: z.boolean(),
          status: z.string(),
          conclusion: z.string().optional(),
        }),
      ),
      unresolvedThreads: z.array(
        z.strictObject({ id: z.string(), url: z.url().optional(), outdated: z.boolean() }),
      ),
      completeness: z.strictObject({
        checks: z.enum(['complete', 'unavailable', 'truncated']),
        requiredChecks: z.enum(['complete', 'unavailable', 'truncated']),
        threads: z.enum(['complete', 'truncated']),
      }),
      advisory: z.array(z.string()),
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
  }),
  jsonSchema: 'input',
});
