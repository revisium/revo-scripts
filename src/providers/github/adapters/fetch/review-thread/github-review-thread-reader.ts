import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';

const query = `query ReviewThread($id: ID!) {
  node(id: $id) {
    ... on PullRequestReviewThread {
      id isResolved
      pullRequest { number headRefOid repository { name owner { login } } }
      comments(last: 100) { pageInfo { hasPreviousPage } nodes { id body } }
    }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    node: z.looseObject({
      id: z.string(),
      isResolved: z.boolean(),
      pullRequest: z.looseObject({
        number: z.number().int().positive(),
        headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
        repository: z.looseObject({
          name: z.string(),
          owner: z.looseObject({ login: z.string() }),
        }),
      }),
      comments: z.looseObject({
        pageInfo: z.looseObject({ hasPreviousPage: z.boolean() }),
        nodes: z.array(z.looseObject({ id: z.string(), body: z.string() })).max(100),
      }),
    }),
  }),
});

export interface GitHubReviewThreadSnapshot {
  readonly id: string;
  readonly resolved: boolean;
  readonly comments: readonly Readonly<{ id: string; body: string }>[];
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
      thread.pullRequest.headRefOid !== expectedHeadSha
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The review thread does not belong to the pinned pull request revision.',
      );
    }
    return { id: thread.id, resolved: thread.isResolved, comments: thread.comments.nodes };
  }
}
