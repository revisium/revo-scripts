import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import type {
  GitHubReviewThreadResolveClient,
  GitHubReviewThreadResolveRequest,
  GitHubReviewThreadResolveSnapshot,
} from '../../../contracts/github-review-thread-resolve-client.js';
import { GitHubApiClient } from '../github-api-client.js';
import { githubReviewThreadReplyMarkerFingerprint } from '../github-review-thread-marker.js';
import { GitHubReviewThreadReader } from './github-review-thread-reader.js';
import { findGitHubReviewThreadReplyProof } from './github-review-thread-reply-proof.js';

const mutation = `mutation Resolve($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    resolveReviewThread: z.looseObject({
      thread: z.looseObject({ id: z.string().min(1), isResolved: z.boolean() }),
    }),
  }),
});

export class FetchGitHubReviewThreadResolveClient implements GitHubReviewThreadResolveClient {
  private readonly api: GitHubApiClient;
  private readonly reader: GitHubReviewThreadReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.reader = new GitHubReviewThreadReader(api, coordinates);
  }

  async resolveBatch(
    request: GitHubReviewThreadResolveRequest,
  ): Promise<readonly GitHubReviewThreadResolveSnapshot[]> {
    validateResolveRequest(request);
    return await this.resolveItems(request, 0, []);
  }

  private async resolveItems(
    request: GitHubReviewThreadResolveRequest,
    index: number,
    resolutions: GitHubReviewThreadResolveSnapshot[],
  ): Promise<readonly GitHubReviewThreadResolveSnapshot[]> {
    const item = request.items[index];
    if (item === undefined) {
      return resolutions;
    }
    resolutions.push(await this.resolveItem(request, item));
    return await this.resolveItems(request, index + 1, resolutions);
  }

  private async resolveItem(
    request: GitHubReviewThreadResolveRequest,
    item: GitHubReviewThreadResolveRequest['items'][number],
  ): Promise<GitHubReviewThreadResolveSnapshot> {
    const thread = await this.reader.read(
      item.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    const proof = findGitHubReviewThreadReplyProof(thread, item);
    if (proof === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The selected review thread is missing the matching reply proof.',
      );
    }
    if (thread.resolved) {
      return toSnapshot(item, 'already-resolved');
    }
    const response = responseSchema.safeParse(
      await this.api.graphql(mutation, { threadId: thread.id }, request.signal),
    );
    if (!response.success || !response.data.data.resolveReviewThread.thread.isResolved) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm review thread resolution.',
      );
    }
    const readback = await this.reader.read(
      item.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    if (!readback.resolved || findGitHubReviewThreadReplyProof(readback, item) === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not read back the resolved review thread and reply proof.',
      );
    }
    return toSnapshot(item, 'resolved');
  }
}

const toSnapshot = (
  item: GitHubReviewThreadResolveRequest['items'][number],
  status: 'resolved' | 'already-resolved',
): GitHubReviewThreadResolveSnapshot => ({
  threadId: item.threadId,
  status,
  replyId: item.replyId,
  marker: item.marker,
  markerFingerprint: item.markerFingerprint,
});

const validateResolveRequest = (request: GitHubReviewThreadResolveRequest): void => {
  if (
    request.items.length > 100 ||
    new Set(request.items.map((item) => item.threadId)).size !== request.items.length ||
    request.items.some(
      (item) => item.markerFingerprint !== githubReviewThreadReplyMarkerFingerprint(item.marker),
    )
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Review-thread resolution batches must contain at most 100 unique valid proofs.',
    );
  }
};
