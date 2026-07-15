import type { GitHubPullRequestSnapshot } from '../../../providers/github/index.js';
import type { GitHubPullRequestV1 } from './types.js';

export const toGitHubPullRequest = (
  repositoryId: string,
  owner: string,
  repository: string,
  snapshot: GitHubPullRequestSnapshot,
): GitHubPullRequestV1 => ({
  schemaVersion: 'github-pull-request/v1',
  repositoryId,
  owner,
  repository,
  number: snapshot.number,
  pullRequestId: snapshot.nodeId,
  url: snapshot.url,
  head: snapshot.head,
  base: snapshot.base,
  providerRevision: snapshot.providerRevision,
  state: snapshot.state,
  draft: snapshot.draft,
  ...(snapshot.mergeCommitSha === undefined ? {} : { mergeCommitSha: snapshot.mergeCommitSha }),
});
