import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import type {
  GitHubReviewThreadRespondClient,
  GitHubReviewThreadRespondRequest,
  GitHubReviewThreadRespondSnapshot,
} from '../../../contracts/github-review-thread-respond-client.js';
import { GitHubApiClient } from '../github-api-client.js';
import {
  githubReviewThreadReplyBody,
  githubReviewThreadReplyMarker,
  githubReviewThreadReplyMarkerFingerprint,
} from '../github-review-thread-marker.js';
import { GitHubReviewThreadReader } from './github-review-thread-reader.js';
import { findGitHubReviewThreadReplyProof } from './github-review-thread-reply-proof.js';

const mutation = `mutation Reply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment { id }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    addPullRequestReviewThreadReply: z.looseObject({
      comment: z.looseObject({ id: z.string().min(1) }),
    }),
  }),
});

export class FetchGitHubReviewThreadRespondClient implements GitHubReviewThreadRespondClient {
  private readonly api: GitHubApiClient;
  private readonly reader: GitHubReviewThreadReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.reader = new GitHubReviewThreadReader(api, coordinates);
  }

  async respondBatch(
    request: GitHubReviewThreadRespondRequest,
  ): Promise<readonly GitHubReviewThreadRespondSnapshot[]> {
    validateRespondRequest(request);
    return await this.respondItems(request, 0, []);
  }

  private async respondItems(
    request: GitHubReviewThreadRespondRequest,
    index: number,
    replies: GitHubReviewThreadRespondSnapshot[],
  ): Promise<readonly GitHubReviewThreadRespondSnapshot[]> {
    const item = request.items[index];
    if (item === undefined) {
      return replies;
    }
    replies.push(await this.respondItem(request, item));
    return await this.respondItems(request, index + 1, replies);
  }

  private async respondItem(
    request: GitHubReviewThreadRespondRequest,
    item: GitHubReviewThreadRespondRequest['items'][number],
  ): Promise<GitHubReviewThreadRespondSnapshot> {
    const marker = githubReviewThreadReplyMarker({
      operationKey: request.operationKey,
      pullRequestNumber: request.pullRequestNumber,
      headCommit: request.expectedHeadSha,
      threadId: item.threadId,
      replyBody: item.replyBody,
    });
    const existing = await this.readExactReply(request, item, marker);
    if (existing !== undefined) {
      return toSnapshot(item, existing.replyId, marker, 'already-replied');
    }
    const thread = await this.reader.read(
      item.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    if (thread.resolved) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The selected review thread is resolved without the matching reply proof.',
      );
    }
    const response = responseSchema.safeParse(
      await this.api.graphql(
        mutation,
        { threadId: thread.id, body: githubReviewThreadReplyBody(item.replyBody, marker) },
        request.signal,
      ),
    );
    if (!response.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid review reply mutation response.',
      );
    }
    const proof = await this.readExactReply(request, item, marker);
    if (
      proof === undefined ||
      proof.replyId !== response.data.data.addPullRequestReviewThreadReply.comment.id
    ) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not read back the exact posted review-thread reply.',
      );
    }
    return toSnapshot(item, proof.replyId, marker, 'replied');
  }

  private async readExactReply(
    request: GitHubReviewThreadRespondRequest,
    item: GitHubReviewThreadRespondRequest['items'][number],
    marker: string,
  ): Promise<Readonly<{ replyId: string }> | undefined> {
    const thread = await this.reader.read(
      item.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    return findGitHubReviewThreadReplyProof(thread, { marker, replyBody: item.replyBody });
  }
}

const toSnapshot = (
  item: GitHubReviewThreadRespondRequest['items'][number],
  replyId: string,
  marker: string,
  status: 'replied' | 'already-replied',
): GitHubReviewThreadRespondSnapshot => ({
  threadId: item.threadId,
  disposition: item.disposition,
  status,
  replyId,
  marker,
  markerFingerprint: githubReviewThreadReplyMarkerFingerprint(marker),
});

const validateRespondRequest = (request: GitHubReviewThreadRespondRequest): void => {
  if (
    request.items.length > 100 ||
    new Set(request.items.map((item) => item.threadId)).size !== request.items.length
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Review-thread response batches must contain at most 100 unique thread ids.',
    );
  }
};
