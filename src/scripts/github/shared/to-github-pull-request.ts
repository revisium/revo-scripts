import type { GitHubPullRequestSnapshot } from '../../../providers/github/index.js';
import type { GitHubPullRequestV1 } from './types.js';

export const toGitHubPullRequest = (
  repositoryId: string,
  snapshot: GitHubPullRequestSnapshot,
): GitHubPullRequestV1 => ({
  schemaVersion: 'github-pull-request/v1',
  repositoryId,
  number: snapshot.number,
  pullRequestId: snapshot.nodeId,
  url: snapshot.url,
  head: snapshot.head,
  base: snapshot.base,
  state: snapshot.state,
  draft: snapshot.draft,
  ...(snapshot.mergeCommitSha === undefined ? {} : { mergeCommitSha: snapshot.mergeCommitSha }),
});
