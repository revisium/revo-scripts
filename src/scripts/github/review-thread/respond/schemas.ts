import { z } from 'zod';

import { createScriptSchema } from '../../../../runtime/definition/schema/create-script-schema.js';
import { questionGateResolutionArtifactSchema } from '../../../approval/contracts/gate-resolution-schemas.js';
import { githubPullRequestShape } from '../../shared/schemas.js';

const triageItemSchema = z.strictObject({
  threadId: z.string().min(1).max(256),
  decision: z.enum(['fix', 'wontfix', 'question']),
  replyText: z.string().min(1).max(64_000).optional(),
});

export const githubReviewThreadRespondInputSchema = createScriptSchema({
  id: 'revo.script.github.review-thread.respond.input/v1',
  schema: z
    .strictObject({
      schemaVersion: z.literal('github-review-threads-respond-input/v1'),
      pullRequest: z.strictObject(githubPullRequestShape),
      triage: z.strictObject({ items: z.array(triageItemSchema).max(100) }),
      questionResolution: questionGateResolutionArtifactSchema.optional(),
    })
    .superRefine((input, context) => {
      const threadIds = new Set<string>();
      const hasQuestion = input.triage.items.some((item) => item.decision === 'question');
      if (hasQuestion && input.questionResolution === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Question triage requires an active continuation resolution.',
          path: ['questionResolution'],
        });
      }
      if (!hasQuestion && input.questionResolution !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Question resolution requires at least one question triage item.',
          path: ['questionResolution'],
        });
      }
      for (const [index, item] of input.triage.items.entries()) {
        if (threadIds.has(item.threadId)) {
          context.addIssue({
            code: 'custom',
            message: 'Review-thread triage items must have unique thread ids.',
            path: ['triage', 'items', index, 'threadId'],
          });
        }
        threadIds.add(item.threadId);
        if (item.decision !== 'question' && item.replyText?.trim().length === 0) {
          context.addIssue({
            code: 'custom',
            message: 'Selected review-thread reply text must not be blank.',
            path: ['triage', 'items', index, 'replyText'],
          });
        }
      }
    }),
  jsonSchema: 'input',
});
export const githubReviewThreadRespondResultSchema = createScriptSchema({
  id: 'schema:githubReviewThreadsRespond/v1',
  schema: z.strictObject({
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
  }),
  jsonSchema: 'output',
});
