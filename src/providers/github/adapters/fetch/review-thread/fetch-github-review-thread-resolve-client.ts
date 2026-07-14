import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import type {
  GitHubReviewThreadResolveClient,
  GitHubReviewThreadResolveRequest,
  GitHubReviewThreadResolveSnapshot,
} from '../../../contracts/github-review-thread-resolve-client.js';
import { GitHubApiClient } from '../github-api-client.js';
import { GitHubReviewThreadReader } from './github-review-thread-reader.js';

const mutation = `mutation Resolve($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } }
}`;
const responseSchema = z.looseObject({
  data: z.looseObject({
    resolveReviewThread: z.looseObject({
      thread: z.looseObject({ id: z.string(), isResolved: z.boolean() }),
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

  async resolve(
    request: GitHubReviewThreadResolveRequest,
  ): Promise<GitHubReviewThreadResolveSnapshot> {
    const thread = await this.reader.read(
      request.threadId,
      request.pullRequestNumber,
      request.expectedHeadSha,
      request.signal,
    );
    if (thread.resolved) {
      return { threadId: thread.id, resolved: true };
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
    return { threadId: response.data.data.resolveReviewThread.thread.id, resolved: true };
  }
}
