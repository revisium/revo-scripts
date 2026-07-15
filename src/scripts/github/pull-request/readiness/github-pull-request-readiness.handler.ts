import type { GitHubPullRequestReadinessSnapshot } from '../../../../providers/github/index.js';
import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
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
      number: input.pullRequestNumber,
      expectedHeadSha: input.expectedHeadSha,
      signal: context.signal,
    });
    if (snapshot.headSha !== input.expectedHeadSha) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The pull request head no longer matches the pinned revision.',
      );
    }
    const blockers = this.blockers(snapshot);
    return {
      value: {
        schemaVersion: 'github-readiness/v1',
        repositoryId: input.repositoryId,
        pullRequestNumber: input.pullRequestNumber,
        headSha: snapshot.headSha,
        ready: blockers.length === 0,
        blockers,
      },
    };
  }

  private blockers(snapshot: GitHubPullRequestReadinessSnapshot): readonly string[] {
    const blockers: string[] = [];
    if (snapshot.state !== 'open') {
      blockers.push(`state:${snapshot.state}`);
    }
    if (snapshot.draft) {
      blockers.push('pull-request:draft');
    }
    if (snapshot.mergeable !== 'mergeable') {
      blockers.push(`mergeable:${snapshot.mergeable}`);
    }
    if (snapshot.reviewDecision !== 'approved') {
      blockers.push(`review:${snapshot.reviewDecision}`);
    }
    for (const check of snapshot.checks) {
      if (check.status !== 'success') {
        blockers.push(`check:${check.name}:${check.status}`);
      }
    }
    return blockers;
  }
}
