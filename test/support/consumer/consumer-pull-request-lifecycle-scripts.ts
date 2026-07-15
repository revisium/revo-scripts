import type { ScriptIdentityPin } from '../../../src/index.js';

export type ConsumerPullRequestLifecycleScripts = Readonly<
  Record<
    | 'status'
    | 'approval'
    | 'commit'
    | 'push'
    | 'upsert'
    | 'markReady'
    | 'readiness'
    | 'respond'
    | 'resolve'
    | 'merge',
    ScriptIdentityPin
  >
>;

export const consumerPullRequestLifecycleScripts: ConsumerPullRequestLifecycleScripts = {
  approval: { id: 'script:approval/subject', version: 1 },
  status: { id: 'script:git/status', version: 1 },
  commit: { id: 'script:git/commit', version: 1 },
  push: { id: 'script:git/push', version: 1 },
  upsert: { id: 'script:github/pull-request/upsert', version: 1 },
  markReady: { id: 'script:github/pull-request/mark-ready', version: 1 },
  readiness: { id: 'script:github/pull-request/readiness', version: 1 },
  respond: { id: 'script:github/review-threads/respond', version: 1 },
  resolve: { id: 'script:github/review-threads/resolve', version: 1 },
  merge: { id: 'script:github/pull-request/merge', version: 1 },
};
