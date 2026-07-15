import { createHash } from 'node:crypto';

import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestReadinessSnapshot } from '../../../contracts/github-pull-request-readiness-client.js';
import type { GitHubRequiredCheckIdentity } from './github-required-check-identity-reader.js';

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
        mergeStateStatus: z.string().nullable(),
        headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
        baseRef: z
          .looseObject({
            name: z.string().min(1).max(256),
            branchProtectionRule: z
              .looseObject({
                requiresStatusChecks: z.boolean(),
                requiredStatusCheckContexts: z.array(z.string()).max(100).nullable(),
              })
              .nullable(),
          })
          .nullable(),
        reviewThreads: z.looseObject({
          pageInfo: z.looseObject({ hasNextPage: z.boolean() }),
          nodes: z
            .array(
              z.looseObject({
                id: z.string(),
                isResolved: z.boolean(),
                isOutdated: z.boolean(),
                comments: z.looseObject({ nodes: z.array(z.looseObject({ url: z.url() })).max(1) }),
              }),
            )
            .max(100),
        }),
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
): Omit<GitHubPullRequestReadinessSnapshot['checks'][number], 'required'> => {
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

export const parseGitHubReadinessBaseBranch = (value: unknown): string => {
  const response = responseSchema.safeParse(value);
  if (!response.success || response.data.data.repository.pullRequest.baseRef === null) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'GitHub returned an invalid readiness response.',
    );
  }
  return response.data.data.repository.pullRequest.baseRef.name;
};

export const parseGitHubReadinessResponse = (
  value: unknown,
  observedAt: string,
  rulesetIdentity: GitHubRequiredCheckIdentity,
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
  const branchProtection = pullRequest.baseRef?.branchProtectionRule;
  const branchProtectionNames = branchProtection?.requiredStatusCheckContexts;
  const branchProtectionComplete = branchProtection?.requiresStatusChecks
    ? branchProtectionNames === null
      ? 'unavailable'
      : 'complete'
    : 'complete';
  let requiredChecksComplete: 'complete' | 'truncated' | 'unavailable' = 'complete';
  if (branchProtectionComplete === 'unavailable' || rulesetIdentity.complete === 'unavailable') {
    requiredChecksComplete = 'unavailable';
  } else if (rulesetIdentity.complete === 'truncated') {
    requiredChecksComplete = 'truncated';
  }
  const requiredNames =
    requiredChecksComplete === 'complete'
      ? [...new Set([...(branchProtectionNames ?? []), ...rulesetIdentity.names])]
      : [];
  const observedChecks = (rollup?.contexts.nodes ?? []).map((item) => {
    const parsed = check(item);
    return {
      ...parsed,
      required: requiredChecksComplete === 'complete' && requiredNames.includes(parsed.name),
    };
  });
  const observedNames = new Set(observedChecks.map((item) => item.name));
  const missingRequiredChecks = requiredNames
    .filter((name) => !observedNames.has(name))
    .map((name) => ({ name, required: true, status: 'pending' as const }));
  const checks = [...observedChecks, ...missingRequiredChecks];
  const threads = pullRequest.reviewThreads.nodes.map((thread) => ({
    id: thread.id,
    resolved: thread.isResolved,
    outdated: thread.isOutdated,
    ...(thread.comments.nodes[0]?.url === undefined ? {} : { url: thread.comments.nodes[0].url }),
  }));
  const normalized: Omit<GitHubPullRequestReadinessSnapshot, 'providerRevision'> = {
    headSha: pullRequest.headRefOid,
    state: state(pullRequest.state),
    draft: pullRequest.isDraft,
    mergeable: mergeable(pullRequest.mergeable),
    mergeState: pullRequest.mergeStateStatus ?? 'UNKNOWN',
    observedAt,
    checksComplete:
      rollup == null
        ? 'unavailable'
        : rollup.contexts.pageInfo.hasNextPage
          ? 'truncated'
          : 'complete',
    requiredChecksComplete,
    threadsComplete: pullRequest.reviewThreads.pageInfo.hasNextPage ? 'truncated' : 'complete',
    checks: checks.toSorted((left, right) => left.name.localeCompare(right.name)),
    threads: threads.toSorted((left, right) => left.id.localeCompare(right.id)),
  };
  const { observedAt: _observedAt, ...providerState } = normalized;
  const revision = createHash('sha256').update(JSON.stringify(providerState)).digest('hex');
  return { ...normalized, providerRevision: `github-readiness/v1:sha256:${revision}` };
};
