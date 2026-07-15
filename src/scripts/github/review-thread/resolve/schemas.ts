import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { githubPullRequestShape } from '../../shared/schemas.js';
const responses = z.strictObject({
  schemaVersion: z.literal('github-review-threads-respond-result/v1'),
  pullRequest: z.strictObject({
    owner: z.string(),
    repository: z.string(),
    number: z.number().int().positive(),
    headCommit: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  threads: z
    .array(
      z.strictObject({
        threadId: z.string(),
        disposition: z.enum(['fix', 'wontfix']),
        status: z.enum(['replied', 'already-replied']),
        replyId: z.string(),
        marker: z.string().min(1).max(512),
        markerFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
      }),
    )
    .max(100),
});
export const githubReviewThreadResolveInputSchema = createScriptSchema({
  id: 'revo.script.github.review-thread.resolve.input/v1',
  schema: z
    .strictObject({
      schemaVersion: z.literal('github-review-threads-resolve-input/v1'),
      pullRequest: z.strictObject(githubPullRequestShape),
      responses,
    })
    .superRefine((input, context) => {
      const threadIds = new Set<string>();
      for (const [index, response] of input.responses.threads.entries()) {
        if (threadIds.has(response.threadId)) {
          context.addIssue({
            code: 'custom',
            message: 'Review-thread response proofs must have unique thread ids.',
            path: ['responses', 'threads', index, 'threadId'],
          });
        }
        threadIds.add(response.threadId);
      }
    }),
  jsonSchema: 'input',
});
export const githubReviewThreadResolveResultSchema = createScriptSchema({
  id: 'schema:githubReviewThreadsResolve/v1',
  schema: z.strictObject({
    schemaVersion: z.literal('github-review-threads-resolve-result/v1'),
    pullRequest: responses.shape.pullRequest,
    threads: z
      .array(
        z.strictObject({
          threadId: z.string(),
          status: z.enum(['resolved', 'already-resolved']),
          replyId: z.string(),
          marker: z.string().min(1).max(512),
          markerFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        }),
      )
      .max(100),
  }),
  jsonSchema: 'output',
});
