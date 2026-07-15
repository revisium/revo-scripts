import { createHash } from 'node:crypto';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import {
  isGitHubReviewThreadReplyMarker,
  normalizeGitHubReviewThreadReplyBody,
} from '../github-review-thread-marker.js';
import type { GitHubReviewThreadSnapshot } from './github-review-thread-reader.js';

export const findGitHubReviewThreadReplyProof = (
  thread: GitHubReviewThreadSnapshot,
  expected: Readonly<{
    marker: string;
    replyBody?: string | undefined;
    replyId?: string | undefined;
  }>,
): Readonly<{ replyId: string }> | undefined => {
  if (!isGitHubReviewThreadReplyMarker(expected.marker)) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'The supplied review-thread reply marker is not canonical.',
    );
  }
  const operationKey = /\bkey=(sha256:[0-9a-f]{64})\b/u.exec(expected.marker)?.[1];
  if (operationKey === undefined) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'The supplied review-thread reply marker is invalid.',
    );
  }
  const operationComments = thread.comments.filter((comment) =>
    comment.body.includes(operationKey),
  );
  const matchingComments = operationComments.filter((comment) =>
    comment.body.includes(expected.marker),
  );
  if (operationComments.length === 0) {
    return undefined;
  }
  if (operationComments.length !== 1 || matchingComments.length !== 1) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'GitHub returned ambiguous or conflicting review-thread reply markers.',
    );
  }
  const reply = matchingComments[0]!;
  if (
    reply.authorLogin?.toLowerCase() !== thread.actorLogin.toLowerCase() ||
    (expected.replyId !== undefined && reply.id !== expected.replyId)
  ) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'GitHub returned a review-thread reply with an invalid proof identity.',
    );
  }
  const body = reply.body.endsWith(`\n\n${expected.marker}`)
    ? reply.body.slice(0, -`\n\n${expected.marker}`.length)
    : undefined;
  if (body === undefined || !hasMatchingBodyDigest(body, expected.marker)) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'GitHub returned a review-thread reply with an invalid proof body.',
    );
  }
  if (
    expected.replyBody !== undefined &&
    normalizeGitHubReviewThreadReplyBody(body) !==
      normalizeGitHubReviewThreadReplyBody(expected.replyBody)
  ) {
    throw new ScriptFault(
      'revo.script.idempotency.conflict',
      'GitHub returned a review-thread reply with an unexpected normalized body.',
    );
  }
  return { replyId: reply.id };
};

const hasMatchingBodyDigest = (body: string, marker: string): boolean => {
  const bodyDigest = /\bbody=sha256:([0-9a-f]{64})\b/u.exec(marker)?.[1];
  return (
    bodyDigest !== undefined &&
    createHash('sha256').update(normalizeGitHubReviewThreadReplyBody(body)).digest('hex') ===
      bodyDigest
  );
};
