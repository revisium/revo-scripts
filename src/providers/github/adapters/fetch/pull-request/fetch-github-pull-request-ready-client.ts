import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitHubPullRequestReadyClient,
  GitHubPullRequestReadyRequest,
} from '../../../contracts/github-pull-request-ready-client.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { githubManagedPullRequestOperation } from '../github-operation-marker.js';
import { GitHubPullRequestReader } from './github-pull-request-reader.js';
import { parseGitHubPullRequest } from './github-pull-request-response.js';

const mutation = `mutation MarkReady($id: ID!) {
  markPullRequestReadyForReview(input: {pullRequestId: $id}) {
    pullRequest { number id url headRefName headRefOid baseRefName state isDraft merged mergeCommit { oid } }
  }
}`;

const responseSchema = z.looseObject({
  data: z.looseObject({
    markPullRequestReadyForReview: z.looseObject({
      pullRequest: z.looseObject({
        number: z.number(),
        id: z.string(),
        url: z.url(),
        headRefName: z.string(),
        headRefOid: z.string(),
        baseRefName: z.string(),
        state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
        isDraft: z.boolean(),
        merged: z.boolean(),
        mergeCommit: z.looseObject({ oid: z.string() }).nullable(),
      }),
    }),
  }),
});

export class FetchGitHubPullRequestReadyClient implements GitHubPullRequestReadyClient {
  private readonly api: GitHubApiClient;
  private readonly reader: GitHubPullRequestReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.reader = new GitHubPullRequestReader(api, coordinates);
  }

  async markReady(request: GitHubPullRequestReadyRequest): Promise<GitHubPullRequestSnapshot> {
    const current = await this.reader.read(request.number, request.expectedHeadSha, request.signal);
    if (current.providerRevision !== request.expectedProviderRevision) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request metadata revision no longer matches the pinned revision.',
      );
    }
    if (githubManagedPullRequestOperation(current.body) === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request is not managed by this package.',
      );
    }
    if (current.state !== 'open') {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request is not open at the pinned revision.',
      );
    }
    if (!current.draft) {
      return current;
    }
    const response = responseSchema.safeParse(
      await this.api.graphql(mutation, { id: current.nodeId }, request.signal),
    );
    if (!response.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid ready-for-review response.',
      );
    }
    const pullRequest = response.data.data.markPullRequestReadyForReview.pullRequest;
    const mutationSnapshot = parseGitHubPullRequest({
      number: pullRequest.number,
      node_id: pullRequest.id,
      html_url: pullRequest.url,
      head: { ref: pullRequest.headRefName, sha: pullRequest.headRefOid },
      base: { ref: pullRequest.baseRefName },
      state: pullRequest.state === 'OPEN' ? 'open' : 'closed',
      draft: pullRequest.isDraft,
      merged: pullRequest.merged,
      merge_commit_sha: pullRequest.mergeCommit?.oid ?? null,
      title: current.title,
      body: current.body,
    });
    if (!this.isExactReadyState(mutationSnapshot, current)) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm ready-for-review state.',
      );
    }
    const snapshot = await this.reader.read(
      request.number,
      request.expectedHeadSha,
      request.signal,
    );
    if (
      !this.isExactReadyState(snapshot, current) ||
      githubManagedPullRequestOperation(snapshot.body) === undefined
    ) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not persist the managed ready-for-review state.',
      );
    }
    return snapshot;
  }

  private isExactReadyState(
    snapshot: GitHubPullRequestSnapshot,
    expected: GitHubPullRequestSnapshot,
  ): boolean {
    return (
      snapshot.state === 'open' &&
      !snapshot.draft &&
      snapshot.number === expected.number &&
      snapshot.nodeId === expected.nodeId &&
      snapshot.url === expected.url &&
      snapshot.head.branch === expected.head.branch &&
      snapshot.head.sha === expected.head.sha &&
      snapshot.base.branch === expected.base.branch &&
      snapshot.providerRevision === expected.providerRevision
    );
  }
}
