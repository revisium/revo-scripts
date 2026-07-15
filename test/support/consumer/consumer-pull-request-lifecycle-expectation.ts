import type {
  ConsumerPullRequestLifecycleDynamicFacts,
  ConsumerPullRequestLifecycleOutcome,
} from './consumer-pull-request-lifecycle.js';

export const expectedConsumerPullRequestLifecycle = (
  facts: ConsumerPullRequestLifecycleDynamicFacts,
): ConsumerPullRequestLifecycleOutcome => ({
  status: {
    schemaVersion: 'workspace-change/v1',
    baseCapture: facts.baseCapture,
    headCapture: facts.headCapture,
    changedPaths: [
      { path: 'consumer-flow.txt', status: 'untracked' },
      { path: 'tracked.txt', status: 'modified' },
    ],
    clean: false,
  },
  committedHead: facts.headCommit,
  pushedHead: facts.headCommit,
  remoteHead: facts.headCommit,
  pullRequestHead: facts.headCommit,
  readyHead: facts.headCommit,
  firstReadiness: 'review_changes',
  responseStatus: 'replied',
  resolutionStatus: 'resolved',
  secondReadiness: 'clean',
  merge: {
    schemaVersion: 'github-pull-request-merge-result/v1',
    repositoryId: 'consumer-flow-repository',
    owner: 'revisium',
    repository: 'revo-scripts',
    number: 42,
    pullRequestId: 'PR_consumer_flow_42',
    url: 'https://github.com/revisium/revo-scripts/pull/42',
    approvedHeadCommit: facts.headCommit,
    mergedHeadCommit: facts.headCommit,
    mergeCommit: 'b'.repeat(40),
    method: 'squash',
    status: 'merged',
    sourceBranchDeleted: true,
  },
  githubMutations: [
    'pull-request-upsert',
    'pull-request-mark-ready',
    'review-thread-respond',
    'review-thread-resolve',
    'pull-request-merge',
    'source-branch-delete',
  ],
});
