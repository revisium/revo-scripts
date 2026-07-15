import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResources,
  GitHubPullRequestMergeResult,
} from './types.js';
export class GitHubPullRequestMergeHandler implements ScriptHandler<
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestMergeResources
> {
  // NOSONAR -- owner: scripts maintainers; rationale: one ordered non-bypassable gate matrix; expiry: 2026-09-30.
  async execute(
    // NOSONAR
    input: Readonly<GitHubPullRequestMergeInput>,
    context: Readonly<ScriptContext<GitHubPullRequestMergeResources>>,
  ): Promise<{ readonly value: GitHubPullRequestMergeResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const pr = input.pullRequest;
    this.assertArtifactEquality(input);
    const override = input.gateResolution.resolution.outcome === 'override_merge';
    const audit = input.gateResolution.resolution.audit;
    const unresolvedThreadIds = input.readiness.unresolvedThreads.map((thread) => thread.id);
    if (
      input.readiness.state !== 'open' ||
      input.readiness.draft ||
      input.readiness.mergeable !== 'mergeable' ||
      !['CLEAN', 'UNSTABLE', 'HAS_HOOKS'].includes(input.readiness.mergeState) ||
      input.readiness.completeness.checks !== 'complete' ||
      input.readiness.completeness.requiredChecks !== 'complete' ||
      input.readiness.completeness.threads !== 'complete' ||
      input.readiness.checks.some((check) => check.required && check.status !== 'success')
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The readiness snapshot contains a non-bypassable merge blocker.',
      );
    }
    if (
      (!override && input.readiness.classification !== 'clean') ||
      (override && input.readiness.classification !== 'review_changes') ||
      (!override && audit !== undefined)
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The post-gate readiness snapshot does not authorize merge.',
      );
    }
    if (override && audit === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'An override merge requires an audit.',
      );
    }
    if (
      audit !== undefined &&
      (audit.actor !== input.gateResolution.resolution.decidedBy ||
        audit.headCommit !== pr.head.sha ||
        !this.sameSortedUniqueIds(audit.threadIds, unresolvedThreadIds))
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'The override audit does not match the actionable unresolved threads.',
      );
    }
    if (
      override &&
      !input.readiness.advisory.every(
        (advisory) => advisory === 'checks: none registered' || advisory.startsWith('advisory:'),
      )
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'An override may include only bounded advisory evidence and exact unresolved threads.',
      );
    }
    const snapshot = await context.resources.repository.clients.github.merge({
      number: pr.number,
      expectedHeadSha: pr.head.sha,
      ...(pr.issueRef === undefined ? {} : { expectedIssueRef: this.mergeIssueRef(pr.issueRef) }),
      method: 'squash',
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });
    if (
      snapshot.pullRequest.state !== 'merged' ||
      snapshot.pullRequest.number !== pr.number ||
      snapshot.pullRequest.nodeId !== pr.pullRequestId ||
      snapshot.pullRequest.url !== pr.url ||
      snapshot.pullRequest.head.branch !== pr.head.branch ||
      snapshot.pullRequest.head.sha !== pr.head.sha ||
      snapshot.pullRequest.base.branch !== pr.base.branch ||
      !snapshot.sourceBranchDeleted
    ) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not prove the merged pull request and source branch state.',
      );
    }
    return {
      value: {
        schemaVersion: 'github-pull-request-merge-result/v1',
        repositoryId: pr.repositoryId,
        owner: pr.owner,
        repository: pr.repository,
        number: pr.number,
        pullRequestId: pr.pullRequestId,
        url: pr.url,
        approvedHeadCommit: pr.head.sha,
        mergedHeadCommit: snapshot.pullRequest.head.sha,
        ...(snapshot.pullRequest.mergeCommitSha === undefined
          ? {}
          : { mergeCommit: snapshot.pullRequest.mergeCommitSha }),
        method: 'squash',
        status: snapshot.status,
        sourceBranchDeleted: true,
        ...(pr.issueRef === undefined ? {} : { issueRef: pr.issueRef }),
        ...(override && audit !== undefined
          ? {
              override: {
                actor: audit.actor,
                auditFingerprint: this.auditFingerprint(audit),
                threadIds: audit.threadIds,
              },
            }
          : {}),
      },
    };
  }

  private assertArtifactEquality(input: Readonly<GitHubPullRequestMergeInput>): void {
    const pr = input.pullRequest;
    const gateSubject = input.gateResolution.resolution.subject;
    const subjectUri = `github://${pr.owner}/${pr.repository}/pull/${pr.number}`;
    if (
      pr.issueRef?.action === 'none' ||
      input.approvalSubject.identity.value !== subjectUri ||
      input.approvalSubject.revision.value !== pr.head.sha ||
      gateSubject.identity.scheme !== input.approvalSubject.identity.scheme ||
      gateSubject.identity.value !== input.approvalSubject.identity.value ||
      gateSubject.revision.scheme !== input.approvalSubject.revision.scheme ||
      gateSubject.revision.value !== input.approvalSubject.revision.value ||
      input.readiness.pullRequest.owner !== pr.owner ||
      input.readiness.pullRequest.repository !== pr.repository ||
      input.readiness.pullRequest.number !== pr.number ||
      input.readiness.pullRequest.url !== pr.url ||
      input.readiness.repositoryId !== pr.repositoryId ||
      input.readiness.headCommit !== pr.head.sha ||
      Date.parse(input.readiness.observedAt) < Date.parse(input.gateResolution.resolution.decidedAt)
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'Merge approval artifacts do not match the pinned pull request revision.',
      );
    }
  }

  private auditFingerprint(
    audit: NonNullable<GitHubPullRequestMergeInput['gateResolution']['resolution']['audit']>,
  ): string {
    const canonical = JSON.stringify({
      kind: audit.kind,
      threadIds: audit.threadIds,
      actor: audit.actor,
      reason: audit.reason,
      risk: audit.risk,
      verificationResponsibility: audit.verificationResponsibility,
      headCommit: audit.headCommit,
    });
    return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  }

  private mergeIssueRef(
    issueRef: NonNullable<GitHubPullRequestMergeInput['pullRequest']['issueRef']>,
  ): Readonly<{ owner: string; repository: string; number: number; action: 'close' | 'refs' }> {
    if (issueRef.action === 'none') {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'A merge issue reference must use close or refs action.',
      );
    }
    return {
      owner: issueRef.owner,
      repository: issueRef.repository,
      number: issueRef.number,
      action: issueRef.action,
    };
  }

  private sameSortedUniqueIds(expected: readonly string[], actual: readonly string[]): boolean {
    if (
      expected.length !== new Set(expected).size ||
      expected.some((id, index) => {
        const previous = index === 0 ? undefined : expected[index - 1];
        return previous !== undefined && previous >= id;
      })
    ) {
      return false;
    }
    if (
      actual.length !== new Set(actual).size ||
      actual.some((id, index) => {
        const previous = index === 0 ? undefined : actual[index - 1];
        return previous !== undefined && previous >= id;
      })
    ) {
      return false;
    }
    return expected.length === actual.length && expected.every((id, index) => id === actual[index]);
  }
}
import { createHash } from 'node:crypto';
