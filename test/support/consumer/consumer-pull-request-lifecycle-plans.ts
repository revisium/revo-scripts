import type { ScriptPlanDescriptor } from '../../../src/index.js';

export type ConsumerPullRequestLifecyclePlans = Readonly<
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
    ScriptPlanDescriptor
  >
>;

export const resolveConsumerPullRequestLifecyclePlans = (
  resolveForPlan: (script: {
    readonly id: `script:${string}`;
    readonly version: string;
  }) => ScriptPlanDescriptor,
): ConsumerPullRequestLifecyclePlans => ({
  approval: resolveForPlan({ id: 'script:approval/subject', version: '1.0.0' }),
  status: resolveForPlan({ id: 'script:git/status', version: '1.0.0' }),
  commit: resolveForPlan({ id: 'script:git/commit', version: '1.0.0' }),
  push: resolveForPlan({ id: 'script:git/push', version: '1.0.0' }),
  upsert: resolveForPlan({ id: 'script:github/pull-request/upsert', version: '1.0.0' }),
  markReady: resolveForPlan({ id: 'script:github/pull-request/mark-ready', version: '1.0.0' }),
  readiness: resolveForPlan({ id: 'script:github/pull-request/readiness', version: '1.0.0' }),
  respond: resolveForPlan({ id: 'script:github/review-threads/respond', version: '1.0.0' }),
  resolve: resolveForPlan({ id: 'script:github/review-threads/resolve', version: '1.0.0' }),
  merge: resolveForPlan({ id: 'script:github/pull-request/merge', version: '1.0.0' }),
});
