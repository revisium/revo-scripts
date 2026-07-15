import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestMergeIssueRef } from '../../../contracts/github-pull-request-merge-client.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';

const query = `query ClosingIssueReferences($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 100) {
        pageInfo { hasNextPage }
        nodes { number repository { nameWithOwner } }
      }
    }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    repository: z.looseObject({
      pullRequest: z.looseObject({
        closingIssuesReferences: z.looseObject({
          pageInfo: z.looseObject({ hasNextPage: z.boolean() }),
          nodes: z
            .array(
              z.looseObject({
                number: z.number().int().positive(),
                repository: z.looseObject({ nameWithOwner: z.string().min(3).max(201) }),
              }),
            )
            .max(100),
        }),
      }),
    }),
  }),
});

export class GitHubClosingIssueReferenceReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async contains(
    pullRequestNumber: number,
    expected: GitHubPullRequestMergeIssueRef,
    signal: AbortSignal,
  ): Promise<boolean> {
    const parsed = responseSchema.safeParse(
      await this.api.graphql(
        query,
        {
          owner: this.coordinates.owner,
          repository: this.coordinates.repository,
          number: pullRequestNumber,
        },
        signal,
      ),
    );
    if (!parsed.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned invalid closing issue references.',
      );
    }
    const references = parsed.data.data.repository.pullRequest.closingIssuesReferences;
    if (references.pageInfo.hasNextPage) {
      throw new ScriptFault(
        'revo.script.provider.collection_unbounded',
        'GitHub closing issue references exceed the reconciliation window.',
      );
    }
    const expectedRepository = `${expected.owner}/${expected.repository}`.toLowerCase();
    return references.nodes.some(
      (reference) =>
        reference.number === expected.number &&
        reference.repository.nameWithOwner.toLowerCase() === expectedRepository,
    );
  }
}
