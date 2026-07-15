import { createHash } from 'node:crypto';

const markerPrefix = '<!-- revo-thread-reply:v1';

export const normalizeGitHubReviewThreadReplyBody = (body: string): string =>
  body.replace(/\r\n?/gu, '\n').trim();

export const githubReviewThreadReplyMarker = (
  input: Readonly<{
    operationKey: string;
    pullRequestNumber: number;
    headCommit: string;
    threadId: string;
    replyBody: string;
  }>,
): string =>
  `${markerPrefix} key=sha256:${sha256(input.operationKey)} pr=${input.pullRequestNumber} head=${input.headCommit} thread=sha256:${sha256(input.threadId)} body=sha256:${sha256(normalizeGitHubReviewThreadReplyBody(input.replyBody))} -->`;

export const githubReviewThreadReplyMarkerFingerprint = (marker: string): string =>
  `sha256:${sha256(marker)}`;

export const githubReviewThreadReplyBody = (replyBody: string, marker: string): string =>
  `${normalizeGitHubReviewThreadReplyBody(replyBody)}\n\n${marker}`;

export const isGitHubReviewThreadReplyMarker = (value: string): boolean =>
  /^<!-- revo-thread-reply:v1 key=sha256:[0-9a-f]{64} pr=[1-9][0-9]* head=[0-9a-f]{40} thread=sha256:[0-9a-f]{64} body=sha256:[0-9a-f]{64} -->$/u.test(
    value,
  );

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
