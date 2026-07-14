import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import type {
  GitHubReviewThreadRespondClient,
  GitHubReviewThreadRespondRequest,
  GitHubReviewThreadRespondSnapshot,
} from '../../../contracts/github-review-thread-respond-client.js';
import { GitHubApiClient } from '../github-api-client.js';
import { githubOperationMarker } from '../github-operation-marker.js';
import { GitHubReviewThreadReader } from './github-review-thread-reader.js';

const mutation = `mutation Reply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment { id body }
  }
}`;
const responseSchema = z.looseObject({
  data: z.looseObject({
    addPullRequestReviewThreadReply: z.looseObject({
      comment: z.looseObject({ id: z.string(), body: z.string() }),
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

  async respond(
    request: GitHubReviewThreadRespondRequest,
  ): Promise<GitHubReviewThreadRespondSnapshot> {
    const thread = await this.reader.read(
      request.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    const marker = githubOperationMarker(request.operationKey);
    const existing = thread.comments.find((comment) => comment.body.includes(marker));
    if (existing !== undefined) {
      return { threadId: thread.id, replyId: existing.id, resolved: thread.resolved };
    }
    const response = responseSchema.safeParse(
      await this.api.graphql(
        mutation,
        { threadId: thread.id, body: `${request.body}\n\n${marker}` },
        request.signal,
      ),
    );
    if (
      !response.success ||
      !response.data.data.addPullRequestReviewThreadReply.comment.body.includes(marker)
    ) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid review reply.',
      );
    }
    return {
      threadId: thread.id,
      replyId: response.data.data.addPullRequestReviewThreadReply.comment.id,
      resolved: thread.resolved,
    };
  }
}
