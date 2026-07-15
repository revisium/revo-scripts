import type { GitHubPullRequestReadinessSnapshot } from '../../../../providers/github/index.js';
import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import type {
  GitHubPullRequestReadinessInput,
  GitHubPullRequestReadinessResources,
  GitHubPullRequestReadinessResult,
} from './types.js';

export class GitHubPullRequestReadinessHandler implements ScriptHandler<
  GitHubPullRequestReadinessInput,
  GitHubPullRequestReadinessResult,
  GitHubPullRequestReadinessResources
> {
  async execute(
    input: Readonly<GitHubPullRequestReadinessInput>,
    context: Readonly<ScriptContext<GitHubPullRequestReadinessResources>>,
  ): Promise<{ readonly value: GitHubPullRequestReadinessResult }> {
    const snapshot = await context.resources.repository.clients.github.readReadiness({
      number: input.number,
      signal: context.signal,
    });
    return { value: this.result(input, snapshot) };
  }

  private result(
    input: Readonly<GitHubPullRequestReadinessInput>,
    snapshot: GitHubPullRequestReadinessSnapshot,
  ): GitHubPullRequestReadinessResult {
    const unresolvedThreads = snapshot.threads
      .filter((thread) => !thread.resolved && !thread.outdated)
      .map((thread) => ({
        id: thread.id,
        ...(thread.url === undefined ? {} : { url: thread.url }),
        outdated: thread.outdated,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const advisory = snapshot.checks
      .filter((check) => !check.required && check.status !== 'success')
      .map((check) => `advisory:${check.name}:${check.status}`);
    if (snapshot.checks.length === 0 && snapshot.checksComplete === 'complete') {
      advisory.push('checks: none registered');
    }
    return {
      schemaVersion: 'github-readiness/v1',
      repositoryId: input.repositoryId,
      pullRequest: {
        owner: input.owner,
        repository: input.repository,
        number: input.number,
        url: input.url,
      },
      observedAt: snapshot.observedAt,
      providerRevision: snapshot.providerRevision,
      headCommit: snapshot.headSha,
      state: snapshot.state,
      draft: snapshot.draft,
      mergeable: snapshot.mergeable,
      mergeState: snapshot.mergeState,
      checks: snapshot.checks,
      unresolvedThreads,
      completeness: {
        checks: snapshot.checksComplete,
        requiredChecks: snapshot.requiredChecksComplete,
        threads: snapshot.threadsComplete,
      },
      advisory,
      classification: this.classify(snapshot, unresolvedThreads.length),
    };
  }

  private classify(
    snapshot: GitHubPullRequestReadinessSnapshot,
    unresolvedThreadCount: number,
  ): GitHubPullRequestReadinessResult['classification'] {
    if (snapshot.state === 'merged') {
      return 'merged';
    }
    if (snapshot.state === 'closed') {
      return 'closed';
    }
    if (snapshot.threadsComplete !== 'complete' || snapshot.checksComplete === 'truncated') {
      return 'unclassifiable';
    }
    if (snapshot.draft) {
      return 'recheck';
    }
    if (unresolvedThreadCount > 0) {
      return 'review_changes';
    }
    if (snapshot.checks.some((check) => check.required && check.status === 'failure')) {
      return 'ci_changes';
    }
    if (
      snapshot.requiredChecksComplete !== 'complete' ||
      snapshot.checksComplete === 'unavailable' ||
      snapshot.checks.some((check) => check.required && check.status === 'pending')
    ) {
      return 'recheck';
    }
    if (snapshot.mergeable === 'unknown') {
      return 'recheck';
    }
    if (
      snapshot.mergeable === 'conflicting' ||
      !['CLEAN', 'UNSTABLE', 'HAS_HOOKS'].includes(snapshot.mergeState)
    ) {
      return 'unclassifiable';
    }
    return 'clean';
  }
}
