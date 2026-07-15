import { pullRequest } from './github-contract-fixture.js';
import { jsonResponse } from './github-provider-consumer-fixture.js';
import {
  githubReviewThreadMarker,
  githubReviewThreadMarkerFingerprint,
} from './github-review-thread-marker-fixture.js';

export interface ReviewThreadState {
  resolved: boolean;
  comments: Array<Readonly<{ id: string; body: string; actor: string }>>;
  replyMutations: number;
  resolveMutations: number;
}

export const respondInput = (items: readonly unknown[]) => ({
  schemaVersion: 'github-review-threads-respond-input/v1' as const,
  pullRequest,
  triage: { items },
});

export const responseProof = (operationKey: string, replyId = 'reply-1') => {
  const marker = githubReviewThreadMarker({
    operationKey,
    pullRequestNumber: pullRequest.number,
    headCommit: pullRequest.head.sha,
    threadId: 'thread-1',
    replyBody: 'Addressed.',
  });
  return {
    schemaVersion: 'github-review-threads-respond-result/v1' as const,
    pullRequest: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: pullRequest.number,
      headCommit: pullRequest.head.sha,
    },
    threads: [
      {
        threadId: 'thread-1',
        disposition: 'fix' as const,
        status: 'replied' as const,
        replyId,
        marker,
        markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
      },
    ],
  };
};

export const onlyThread = (proof: ReturnType<typeof responseProof>) => {
  const thread = proof.threads.at(0);
  if (thread === undefined) {
    throw new Error('Response proof fixture must contain one thread.');
  }
  return thread;
};

export const reviewThreadResponse = (
  state: ReviewThreadState,
  options: Readonly<{
    owner?: string;
    repository?: string;
    head?: string;
    state?: string;
    hasPreviousPage?: boolean;
  }> = {},
) => ({
  data: {
    viewer: { login: 'revo-bot' },
    node: {
      id: 'thread-1',
      isResolved: state.resolved,
      pullRequest: {
        number: pullRequest.number,
        headRefOid: options.head ?? pullRequest.head.sha,
        state: options.state ?? 'OPEN',
        repository: {
          name: options.repository ?? 'revo-scripts',
          owner: { login: options.owner ?? 'revisium' },
        },
      },
      comments: {
        pageInfo: { hasPreviousPage: options.hasPreviousPage ?? false },
        nodes: state.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          author: { login: comment.actor },
        })),
      },
    },
  },
});

export const statefulFetch = (
  state: ReviewThreadState,
  options: Readonly<{
    reviewThread?: () => unknown;
    failAfterReply?: boolean;
    failAfterResolve?: boolean;
    invalidReplyMutation?: boolean;
  }> = {},
): typeof globalThis.fetch => {
  let failAfterReply = options.failAfterReply ?? false;
  let failAfterResolve = options.failAfterResolve ?? false;
  return async (_input, init) => {
    const request = typeof init?.body === 'string' ? parseRequest(init.body) : {};
    const query = typeof request.query === 'string' ? request.query : '';
    const variables = isRecord(request.variables) ? request.variables : {};
    if (query.includes('mutation Reply')) {
      state.replyMutations += 1;
      const body = typeof variables.body === 'string' ? variables.body : '';
      state.comments.push({ id: `reply-${state.replyMutations}`, body, actor: 'revo-bot' });
      if (failAfterReply) {
        failAfterReply = false;
        throw new TypeError('network lost after reply mutation');
      }
      if (options.invalidReplyMutation === true) {
        return jsonResponse({ data: { addPullRequestReviewThreadReply: { comment: {} } } });
      }
      return jsonResponse({
        data: {
          addPullRequestReviewThreadReply: { comment: { id: `reply-${state.replyMutations}` } },
        },
      });
    }
    if (query.includes('mutation Resolve')) {
      state.resolveMutations += 1;
      state.resolved = true;
      if (failAfterResolve) {
        failAfterResolve = false;
        throw new TypeError('network lost after resolve mutation');
      }
      return jsonResponse({
        data: { resolveReviewThread: { thread: { id: 'thread-1', isResolved: true } } },
      });
    }
    return jsonResponse(options.reviewThread?.() ?? reviewThreadResponse(state));
  };
};

const parseRequest = (body: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(body);
  return isRecord(parsed) ? parsed : {};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
