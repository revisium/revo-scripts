import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestMergeIssueRef } from '../../../contracts/github-pull-request-merge-client.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';
import { githubManagedPullRequestOperation } from '../github-operation-marker.js';
import { GitHubClosingIssueReferenceReader } from './github-closing-issue-reference-reader.js';
import { parseGitHubPullRequest } from './github-pull-request-response.js';

export class GitHubPullRequestReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;
  private readonly closingIssues: GitHubClosingIssueReferenceReader;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
    this.closingIssues = new GitHubClosingIssueReferenceReader(api, coordinates);
  }

  async read(
    number: number,
    expectedHeadSha: string,
    signal: AbortSignal,
    expectedIssueRef?: GitHubPullRequestMergeIssueRef,
  ): Promise<GitHubPullRequestSnapshot> {
    const pullRequest = parseGitHubPullRequest(
      await this.api.rest(
        `/repos/${this.coordinates.owner}/${this.coordinates.repository}/pulls/${number}`,
        { signal },
      ),
    );
    if (pullRequest.head.sha !== expectedHeadSha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request head no longer matches the pinned revision.',
      );
    }
    if (!(await this.hasExpectedIssueReference(pullRequest, expectedIssueRef, signal))) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The live pull request does not contain the exact requested issue reference.',
      );
    }
    return pullRequest;
  }

  private async hasExpectedIssueReference(
    pullRequest: GitHubPullRequestSnapshot,
    expectedIssueRef: GitHubPullRequestMergeIssueRef | undefined,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (expectedIssueRef === undefined) {
      return true;
    }
    if (expectedIssueRef.action === 'close') {
      return await this.closingIssues.contains(pullRequest.number, expectedIssueRef, signal);
    }
    const issue =
      expectedIssueRef.owner === this.coordinates.owner &&
      expectedIssueRef.repository === this.coordinates.repository
        ? `#${expectedIssueRef.number}`
        : `${expectedIssueRef.owner}/${expectedIssueRef.repository}#${expectedIssueRef.number}`;
    const businessBody =
      githubManagedPullRequestOperation(pullRequest.body)?.businessBody ??
      pullRequest.body.replace(/\r\n?/gu, '\n').trimEnd();
    return businessBody.endsWith(`\n\nRefs ${issue}`);
  }
}
