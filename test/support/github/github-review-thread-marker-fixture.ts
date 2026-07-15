import { createHash } from 'node:crypto';

export const githubReviewThreadMarker = (
  input: Readonly<{
    operationKey: string;
    pullRequestNumber: number;
    headCommit: string;
    threadId: string;
    replyBody: string;
  }>,
): string =>
  `<!-- revo-thread-reply:v1 key=sha256:${sha256(input.operationKey)} pr=${input.pullRequestNumber} head=${input.headCommit} thread=sha256:${sha256(input.threadId)} body=sha256:${sha256(normalize(input.replyBody))} -->`;

export const githubReviewThreadMarkerFingerprint = (marker: string): string =>
  `sha256:${sha256(marker)}`;

const normalize = (body: string): string => body.replace(/\r\n?/gu, '\n').trim();

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
