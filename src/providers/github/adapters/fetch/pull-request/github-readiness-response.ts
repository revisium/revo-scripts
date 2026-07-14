import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestReadinessSnapshot } from '../../../contracts/github-pull-request-readiness-client.js';

const checkRunSchema = z.looseObject({
  __typename: z.literal('CheckRun'),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
});
const statusContextSchema = z.looseObject({
  __typename: z.literal('StatusContext'),
  context: z.string(),
  state: z.string(),
});
const responseSchema = z.looseObject({
  data: z.looseObject({
    repository: z.looseObject({
      pullRequest: z.looseObject({
        state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
        isDraft: z.boolean(),
        mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
        reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
        headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
        commits: z.looseObject({
          nodes: z.array(
            z.looseObject({
              commit: z.looseObject({
                statusCheckRollup: z
                  .looseObject({
                    contexts: z.looseObject({
                      pageInfo: z.looseObject({ hasNextPage: z.boolean() }),
                      nodes: z.array(z.union([checkRunSchema, statusContextSchema])).max(100),
                    }),
                  })
                  .nullable(),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});

const state = (
  value: 'OPEN' | 'CLOSED' | 'MERGED',
): GitHubPullRequestReadinessSnapshot['state'] => {
  if (value === 'OPEN') {
    return 'open';
  }
  return value === 'CLOSED' ? 'closed' : 'merged';
};

const mergeable = (
  value: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN',
): GitHubPullRequestReadinessSnapshot['mergeable'] => {
  if (value === 'MERGEABLE') {
    return 'mergeable';
  }
  return value === 'CONFLICTING' ? 'conflicting' : 'unknown';
};

const reviewDecision = (
  value: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null,
): GitHubPullRequestReadinessSnapshot['reviewDecision'] => {
  if (value === 'APPROVED') {
    return 'approved';
  }
  if (value === 'CHANGES_REQUESTED') {
    return 'changes-requested';
  }
  return value === 'REVIEW_REQUIRED' ? 'review-required' : 'unknown';
};

const statusContextStatus = (
  contextState: string,
): GitHubPullRequestReadinessSnapshot['checks'][number]['status'] => {
  if (contextState === 'SUCCESS') {
    return 'success';
  }
  if (contextState === 'PENDING') {
    return 'pending';
  }
  return 'failure';
};

const checkRunStatus = (
  status: string,
  conclusion: string | null,
): GitHubPullRequestReadinessSnapshot['checks'][number]['status'] => {
  if (status !== 'COMPLETED') {
    return 'pending';
  }
  return ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion ?? '') ? 'success' : 'failure';
};

const check = (
  context: z.infer<typeof checkRunSchema> | z.infer<typeof statusContextSchema>,
): GitHubPullRequestReadinessSnapshot['checks'][number] => {
  if (context['__typename'] === 'StatusContext') {
    return {
      name: context.context,
      status: statusContextStatus(context.state),
    };
  }
  return {
    name: context.name,
    status: checkRunStatus(context.status, context.conclusion),
  };
};

export const parseGitHubReadinessResponse = (
  value: unknown,
): GitHubPullRequestReadinessSnapshot => {
  const response = responseSchema.safeParse(value);
  if (!response.success) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'GitHub returned an invalid readiness response.',
    );
  }
  const pullRequest = response.data.data.repository.pullRequest;
  const rollup = pullRequest.commits.nodes[0]?.commit.statusCheckRollup;
  if (rollup?.contexts.pageInfo.hasNextPage === true) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'GitHub readiness contains more check contexts than the v1 bound.',
    );
  }
  return {
    headSha: pullRequest.headRefOid,
    state: state(pullRequest.state),
    draft: pullRequest.isDraft,
    mergeable: mergeable(pullRequest.mergeable),
    reviewDecision: reviewDecision(pullRequest.reviewDecision),
    checks: (rollup?.contexts.nodes ?? []).map(check),
  };
};
