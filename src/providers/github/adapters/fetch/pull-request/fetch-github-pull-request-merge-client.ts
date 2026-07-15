import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type {
  GitHubPullRequestMergeClient,
  GitHubPullRequestMergeRequest,
  GitHubPullRequestMergeSnapshot,
} from '../../../contracts/github-pull-request-merge-client.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { GitHubPullRequestReader } from './github-pull-request-reader.js';
import { GitHubSourceBranchReader } from './github-source-branch-reader.js';

const mergeResponseSchema = z.looseObject({
  merged: z.literal(true),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
});

export class FetchGitHubPullRequestMergeClient implements GitHubPullRequestMergeClient {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;
  private readonly reader: GitHubPullRequestReader;
  private readonly sourceBranch: GitHubSourceBranchReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
    this.reader = new GitHubPullRequestReader(api, coordinates);
    this.sourceBranch = new GitHubSourceBranchReader(api, coordinates);
  }

  async merge(request: GitHubPullRequestMergeRequest): Promise<GitHubPullRequestMergeSnapshot> {
    const current = await this.reader.read(
      request.number,
      request.expectedHeadSha,
      request.signal,
      request.expectedIssueRef,
    );
    const sourceBranch = await this.sourceBranch.read(current.head.branch, request.signal);
    if (current.state === 'merged') {
      await this.reconcileSourceBranch(sourceBranch, current, request);
      return { pullRequest: current, status: 'already-merged', sourceBranchDeleted: true };
    }
    this.assertMergeable(current);
    this.assertExactSourceBranch(sourceBranch, current.head.sha);
    await this.requestMerge(current, request);
    const merged = await this.reader.read(
      request.number,
      request.expectedHeadSha,
      request.signal,
      request.expectedIssueRef,
    );
    if (merged.state !== 'merged') {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm the pull request merge.',
      );
    }
    await this.reconcileSourceBranch(
      await this.sourceBranch.read(merged.head.branch, request.signal),
      merged,
      request,
    );
    return { pullRequest: merged, status: 'merged', sourceBranchDeleted: true };
  }

  private assertMergeable(pullRequest: GitHubPullRequestSnapshot): void {
    if (
      pullRequest.state !== 'open' ||
      pullRequest.draft ||
      pullRequest.mergeable !== 'mergeable' ||
      pullRequest.mergeState === undefined ||
      !['CLEAN', 'UNSTABLE', 'HAS_HOOKS'].includes(pullRequest.mergeState)
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The live pull request is not open and mergeable at the approved head.',
      );
    }
  }

  private assertExactSourceBranch(sourceBranch: string | undefined, expectedHeadSha: string): void {
    if (sourceBranch === undefined || sourceBranch !== expectedHeadSha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The live source branch does not prove the approved pull request head.',
      );
    }
  }

  private async requestMerge(
    pullRequest: GitHubPullRequestSnapshot,
    request: GitHubPullRequestMergeRequest,
  ): Promise<void> {
    const response = mergeResponseSchema.safeParse(
      await this.api.rest(
        `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${pullRequest.number}/merge`,
        {
          method: 'PUT',
          body: { sha: request.expectedHeadSha, merge_method: request.method },
          signal: request.signal,
        },
      ),
    );
    if (!response.success) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid pull request merge response.',
      );
    }
  }

  private async reconcileSourceBranch(
    sourceBranch: string | undefined,
    pullRequest: GitHubPullRequestSnapshot,
    request: GitHubPullRequestMergeRequest,
  ): Promise<void> {
    if (sourceBranch === undefined) {
      return;
    }
    this.assertExactSourceBranch(sourceBranch, pullRequest.head.sha);
    await this.api.rest(
      `/repos/${this.coordinates.owner}/${this.coordinates.repository}/git/refs/heads/${pullRequest.head.branch}`,
      { method: 'DELETE', allowEmptyResponse: true, signal: request.signal },
    );
    if ((await this.sourceBranch.read(pullRequest.head.branch, request.signal)) !== undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm source-branch deletion.',
      );
    }
  }
}
