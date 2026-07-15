import { z } from 'zod';

const boundedText = z.string().trim().min(1).max(4_096);
const identity = z.strictObject({
  scheme: z.string().min(1).max(256),
  value: z.string().min(1).max(2_048),
});
const subject = z.strictObject({
  outputNode: z.string().min(1).max(256),
  outputOrdinal: z.number().int().nonnegative(),
  identity,
  revision: identity,
  executionPlanHash: z.string().min(1).max(512),
});
const decision = {
  status: z.literal('active'),
  decidedAt: z.iso.datetime({ offset: true }),
  decidedBy: z.string().min(1).max(256),
};
const overrideAudit = z.strictObject({
  kind: z.literal('merge-override/v1'),
  threadIds: z.array(z.string().min(1).max(256)).max(100),
  actor: z.string().min(1).max(256),
  reason: boundedText,
  risk: boundedText,
  verificationResponsibility: boundedText,
  headCommit: z.string().regex(/^[0-9a-f]{40}$/),
  fingerprint: z.string().min(1).max(512).optional(),
});

export const mergeGateResolutionArtifactSchema = z.strictObject({
  schemaVersion: z.literal('gate-resolution/v1'),
  inboxId: z.string().min(1).max(256),
  resolution: z.discriminatedUnion('outcome', [
    z.strictObject({
      ...decision,
      mode: z.literal('subject-approval'),
      outcome: z.literal('approved'),
      subject,
      note: boundedText.optional(),
    }),
    z.strictObject({
      ...decision,
      mode: z.literal('subject-approval'),
      outcome: z.literal('override_merge'),
      subject,
      note: boundedText,
      audit: overrideAudit,
    }),
  ]),
});

export const questionGateResolutionArtifactSchema = z.strictObject({
  schemaVersion: z.literal('gate-resolution/v1'),
  inboxId: z.string().min(1).max(256),
  resolution: z.strictObject({
    ...decision,
    mode: z.literal('continuation'),
    outcome: z.enum(['fix', 'wontfix']),
    note: boundedText,
  }),
});
