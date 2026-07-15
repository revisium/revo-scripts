import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';

const query = `query ReviewThread($id: ID!) {
  viewer { login }
  node(id: $id) {
    ... on PullRequestReviewThread {
      id isResolved
      pullRequest { number headRefOid state repository { name owner { login } } }
      comments(last: 100) { pageInfo { hasPreviousPage } nodes { id body author { login } } }
    }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    viewer: z.looseObject({ login: z.string().min(1) }),
    node: z.nullable(
      z.looseObject({
        id: z.string().min(1),
        isResolved: z.boolean(),
        pullRequest: z.looseObject({
          number: z.number().int().positive(),
          headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
          state: z.string(),
          repository: z.looseObject({
            name: z.string().min(1),
            owner: z.looseObject({ login: z.string().min(1) }),
          }),
        }),
        comments: z.looseObject({
          pageInfo: z.looseObject({ hasPreviousPage: z.boolean() }),
          nodes: z
            .array(
              z.looseObject({
                id: z.string().min(1),
                body: z.string(),
                author: z.nullable(z.looseObject({ login: z.string().min(1) })),
              }),
            )
            .max(100),
        }),
      }),
    ),
  }),
});

export interface GitHubReviewThreadSnapshot {
  readonly id: string;
  readonly resolved: boolean;
  readonly actorLogin: string;
  readonly comments: ReadonlyArray<
    Readonly<{ id: string; body: string; authorLogin?: string | undefined }>
  >;
}

export class GitHubReviewThreadReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async read(
    threadId: string,
    pullRequestNumber: number,
    expectedHeadSha: string,
    signal: AbortSignal,
  ): Promise<GitHubReviewThreadSnapshot> {
    const response = responseSchema.safeParse(
      await this.api.graphql(query, { id: threadId }, signal),
    );
    if (!response.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid review thread.',
      );
    }
    const thread = response.data.data.node;
    if (thread?.id !== threadId) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The selected review thread is missing.',
      );
    }
    if (
      thread.pullRequest.repository.owner.login.toLowerCase() !==
        this.coordinates.owner.toLowerCase() ||
      thread.pullRequest.repository.name.toLowerCase() !== this.coordinates.repository.toLowerCase()
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The review thread does not belong to the bound GitHub repository.',
      );
    }
    if (thread.comments.pageInfo.hasPreviousPage) {
      throw new ScriptFault(
        'revo.script.provider.collection_unbounded',
        'GitHub review thread comments exceed the reconciliation window.',
      );
    }
    if (
      thread.pullRequest.number !== pullRequestNumber ||
      thread.pullRequest.headRefOid !== expectedHeadSha ||
      thread.pullRequest.state !== 'OPEN'
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The review thread does not belong to the pinned open pull request revision.',
      );
    }
    return {
      id: thread.id,
      resolved: thread.isResolved,
      actorLogin: response.data.data.viewer.login,
      comments: thread.comments.nodes.map((comment) => ({
        id: comment.id,
        body: comment.body,
        ...(comment.author === null ? {} : { authorLogin: comment.author.login }),
      })),
    };
  }
}
