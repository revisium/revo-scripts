import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';

const query = `query SourceBranch($owner: String!, $repository: String!, $qualifiedName: String!) {
  repository(owner: $owner, name: $repository) {
    ref(qualifiedName: $qualifiedName) { target { ... on Commit { oid } } }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    repository: z.looseObject({
      ref: z
        .looseObject({ target: z.looseObject({ oid: z.string().regex(/^[0-9a-f]{40}$/) }) })
        .nullable(),
    }),
  }),
});

export class GitHubSourceBranchReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async read(branch: string, signal: AbortSignal): Promise<string | undefined> {
    const parsed = responseSchema.safeParse(
      await this.api.graphql(
        query,
        {
          owner: this.coordinates.owner,
          repository: this.coordinates.repository,
          qualifiedName: `refs/heads/${branch}`,
        },
        signal,
      ),
    );
    if (!parsed.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid source-branch response.',
      );
    }
    return parsed.data.data.repository.ref?.target.oid;
  }
}
