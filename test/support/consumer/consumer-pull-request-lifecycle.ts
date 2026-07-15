import type { GitChangeV1 } from '../../../src/providers/git/index.js';
import {
  approvalSubjectScript,
  type ApprovalSubjectInput,
  type ApprovalSubjectResult,
} from '../../../src/scripts/approval/index.js';
import {
  type GitCommitInput,
  gitCommitScript,
  type GitPushInput,
  gitPushScript,
  type GitStatusInput,
  type GitStatusResult,
  gitStatusScript,
} from '../../../src/scripts/git/index.js';
import {
  githubPullRequestMarkReadyScript,
  githubPullRequestMergeScript,
  githubPullRequestReadinessScript,
  githubPullRequestUpsertScript,
  githubReviewThreadResolveScript,
  githubReviewThreadRespondScript,
  type GitHubPullRequestMergeInput,
  type GitHubPullRequestUpsertInput,
  type GitHubPullRequestV1,
  type GitHubReadinessV1,
  type GitHubReviewThreadResolveResult,
  type GitHubReviewThreadRespondResult,
} from '../../../src/scripts/github/index.js';
import { consumerFlowBindings } from './consumer-flow-bindings.js';
import { createConsumerFlowComposition } from './consumer-flow-composition.js';
import {
  createConsumerFlowGitFixture,
  type ConsumerFlowGitFixture,
} from './consumer-flow-git-fixture.js';
import {
  createConsumerFlowGitHubTransport,
  type ConsumerFlowGitHubTransport,
} from './consumer-flow-github-transport.js';
import { summarizeConsumerPlan } from './consumer-flow-plan-summary.js';
import { executeConsumerFlowStep } from './consumer-flow-step-executor.js';
import {
  resolveConsumerPullRequestLifecyclePlans,
  type ConsumerPullRequestLifecyclePlans,
} from './consumer-pull-request-lifecycle-plans.js';

export interface ConsumerPullRequestLifecycleOutcome {
  readonly status: GitStatusResult;
  readonly committedHead: string;
  readonly pushedHead: string;
  readonly remoteHead: string;
  readonly pullRequestHead: string;
  readonly readyHead: string;
  readonly firstReadiness: string;
  readonly responseStatus: string | undefined;
  readonly resolutionStatus: string | undefined;
  readonly secondReadiness: string;
  readonly merge: unknown;
  readonly githubMutations: readonly string[];
}

export interface ConsumerPullRequestLifecycleDynamicFacts {
  readonly baseCapture: string;
  readonly headCapture: string;
  readonly headCommit: string;
}

export interface ConsumerPullRequestLifecycleCatalog {
  readonly manifests: readonly string[];
  readonly plans: readonly ReturnType<typeof summarizeConsumerPlan>[];
}

export class ConsumerPullRequestLifecycle {
  private readonly plans: ConsumerPullRequestLifecyclePlans;
  private statusResult: GitStatusResult | undefined;
  private committed: GitChangeV1 | undefined;
  private pushed: GitChangeV1 | undefined;
  private pullRequest: GitHubPullRequestV1 | undefined;
  private readyPullRequest: GitHubPullRequestV1 | undefined;
  private reviewChanges: GitHubReadinessV1 | undefined;
  private responses: GitHubReviewThreadRespondResult | undefined;
  private resolutions: GitHubReviewThreadResolveResult | undefined;
  private approvalSubject: ApprovalSubjectResult | undefined;
  private clean: GitHubReadinessV1 | undefined;
  private merged: unknown;

  private constructor(
    private readonly git: ConsumerFlowGitFixture,
    private readonly github: ConsumerFlowGitHubTransport,
    private readonly scripts: ReturnType<typeof createConsumerFlowComposition>,
  ) {
    this.plans = resolveConsumerPullRequestLifecyclePlans(scripts.resolveForPlan.bind(scripts));
  }

  static async create(): Promise<ConsumerPullRequestLifecycle> {
    const git = await createConsumerFlowGitFixture();
    const github = createConsumerFlowGitHubTransport();
    return new ConsumerPullRequestLifecycle(
      git,
      github,
      createConsumerFlowComposition(git, github),
    );
  }

  catalog(): ConsumerPullRequestLifecycleCatalog {
    return {
      manifests: this.scripts
        .listManifests()
        .map((manifest) => `${manifest.id}@${manifest.version}`),
      plans: Object.values(this.plans).map(summarizeConsumerPlan),
    };
  }

  async status(): Promise<void> {
    this.statusResult = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.status,
      executionId: 'consumer-flow:status',
      input: {
        resource: 'repository',
        baseCapture: this.git.baseCapture,
        headCapture: this.git.headCapture,
      } satisfies GitStatusInput,
      bindings: this.gitBindings('read', 'git.status.read', ['filesystem.read', 'git.read']),
      resultSchema: gitStatusScript.resultSchema,
    });
  }

  async commit(): Promise<void> {
    const status = this.required(this.statusResult, 'status');
    this.committed = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.commit,
      executionId: 'consumer-flow:commit',
      idempotencyKey: 'consumer-flow:commit',
      input: {
        resource: 'repository',
        remoteIdentity: this.git.remoteIdentity,
        branch: this.git.branch,
        expectedParent: captureValue(status.baseCapture, 'git-commit:'),
        expectedTree: captureValue(status.headCapture, 'git-tree:'),
        title: 'Compose the consumer flow',
        issueAction: 'none',
        author: {
          name: 'Revisium Bot',
          email: 'bot@revisium.io',
          timestamp: '2026-07-15T09:00:00.000Z',
        },
      } satisfies GitCommitInput,
      bindings: this.gitBindings('write', 'git.commit.write', ['git.read', 'git.write']),
      resultSchema: gitCommitScript.resultSchema,
    });
  }

  async push(): Promise<void> {
    this.pushed = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.push,
      executionId: 'consumer-flow:push',
      idempotencyKey: 'consumer-flow:push',
      input: { change: this.required(this.committed, 'commit') } satisfies GitPushInput,
      bindings: this.gitBindings('publish', 'git.push.publish', ['git.read', 'git.remote-write']),
      resultSchema: gitPushScript.resultSchema,
    });
    this.github.setHeadCommit(this.pushed.headCommit);
  }

  async upsert(): Promise<void> {
    const pushed = this.required(this.pushed, 'push');
    this.pullRequest = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.upsert,
      executionId: 'consumer-flow:upsert',
      idempotencyKey: 'consumer-flow:upsert',
      input: {
        repositoryId: this.git.repositoryId,
        owner: 'revisium',
        repository: 'revo-scripts',
        head: { branch: pushed.branch, sha: pushed.headCommit },
        base: { branch: 'master' },
        title: 'Compose the consumer flow',
        body: 'Proves the public package composition.',
        draft: true,
        issueAction: 'none',
      } satisfies GitHubPullRequestUpsertInput,
      bindings: this.githubBindings('publish', 'github.pull-request.upsert', [
        'github.read',
        'github.write',
      ]),
      resultSchema: githubPullRequestUpsertScript.resultSchema,
    });
  }

  async markReady(): Promise<void> {
    this.readyPullRequest = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.markReady,
      executionId: 'consumer-flow:mark-ready',
      idempotencyKey: 'consumer-flow:mark-ready',
      input: { pullRequest: this.required(this.pullRequest, 'upsert') },
      bindings: this.githubBindings('publish', 'github.pull-request.mark-ready', [
        'github.read',
        'github.write',
      ]),
      resultSchema: githubPullRequestMarkReadyScript.resultSchema,
    });
  }

  async readinessBeforeResponse(): Promise<void> {
    this.reviewChanges = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.readiness,
      executionId: 'consumer-flow:readiness-before-response',
      input: this.required(this.readyPullRequest, 'mark ready'),
      bindings: this.githubBindings('read', 'github.pull-request.readiness', ['github.read']),
      resultSchema: githubPullRequestReadinessScript.resultSchema,
    });
  }

  async respond(): Promise<void> {
    this.responses = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.respond,
      executionId: 'consumer-flow:respond',
      idempotencyKey: 'consumer-flow:respond',
      input: {
        schemaVersion: 'github-review-threads-respond-input/v1',
        pullRequest: this.required(this.readyPullRequest, 'mark ready'),
        triage: { items: [{ threadId: 'thread-1', decision: 'fix', replyText: 'Addressed.' }] },
      },
      bindings: this.githubBindings('publish', 'github.review-thread.respond', [
        'github.read',
        'github.write',
      ]),
      resultSchema: githubReviewThreadRespondScript.resultSchema,
    });
  }

  async resolve(): Promise<void> {
    this.resolutions = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.resolve,
      executionId: 'consumer-flow:resolve',
      idempotencyKey: 'consumer-flow:resolve',
      input: {
        schemaVersion: 'github-review-threads-resolve-input/v1',
        pullRequest: this.required(this.readyPullRequest, 'mark ready'),
        responses: this.required(this.responses, 'response'),
      },
      bindings: this.githubBindings('publish', 'github.review-thread.resolve', [
        'github.read',
        'github.write',
      ]),
      resultSchema: githubReviewThreadResolveScript.resultSchema,
    });
  }

  async readinessAfterResolution(): Promise<void> {
    this.clean = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.readiness,
      executionId: 'consumer-flow:readiness-after-resolution',
      input: this.required(this.readyPullRequest, 'mark ready'),
      bindings: this.githubBindings('read', 'github.pull-request.readiness', ['github.read']),
      resultSchema: githubPullRequestReadinessScript.resultSchema,
    });
  }

  async approval(): Promise<void> {
    const pullRequest = this.required(this.readyPullRequest, 'mark ready');
    this.approvalSubject = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.approval,
      executionId: 'consumer-flow:approval-subject',
      input: {
        kind: 'publication',
        identity: {
          scheme: 'uri',
          value: `github://${pullRequest.owner}/${pullRequest.repository}/pull/${pullRequest.number}`,
        },
        revision: { scheme: 'git-commit', value: pullRequest.head.sha },
        title: 'Merge the consumer-flow pull request',
        summary: 'Approve the exact pull-request head for publication.',
        evidence: [],
        risk: 'Publishes the approved change.',
      } satisfies ApprovalSubjectInput,
      bindings: { resources: {}, credentials: {} },
      resultSchema: approvalSubjectScript.resultSchema,
    });
  }

  async merge(): Promise<void> {
    const readyPullRequest = this.required(this.readyPullRequest, 'mark ready');
    const approvalSubject = this.required(this.approvalSubject, 'approval subject');
    this.merged = await executeConsumerFlowStep(this.scripts, {
      plan: this.plans.merge,
      executionId: 'consumer-flow:merge',
      idempotencyKey: 'consumer-flow:merge',
      input: {
        pullRequest: readyPullRequest,
        approvalSubject,
        gateResolution: {
          schemaVersion: 'gate-resolution/v1',
          inboxId: 'consumer-flow-merge-gate',
          resolution: {
            mode: 'subject-approval',
            status: 'active',
            outcome: 'approved',
            decidedAt: '2026-07-15T00:00:00Z',
            decidedBy: 'reviewer',
            subject: {
              outputNode: 'approval-subject',
              outputOrdinal: 0,
              identity: approvalSubject.identity,
              revision: approvalSubject.revision,
              executionPlanHash: 'sha256:consumer-flow-plan',
            },
          },
        },
        readiness: this.required(this.clean, 'clean readiness'),
      } satisfies GitHubPullRequestMergeInput,
      bindings: this.githubBindings('publish', 'github.pull-request.merge', [
        'github.read',
        'github.write',
      ]),
      resultSchema: githubPullRequestMergeScript.resultSchema,
    });
  }

  async outcome(): Promise<ConsumerPullRequestLifecycleOutcome> {
    const committed = this.required(this.committed, 'commit');
    const pushed = this.required(this.pushed, 'push');
    return {
      status: this.required(this.statusResult, 'status'),
      committedHead: committed.headCommit,
      pushedHead: pushed.headCommit,
      remoteHead: await this.git.readRemoteHead(),
      pullRequestHead: this.required(this.pullRequest, 'upsert').head.sha,
      readyHead: this.required(this.readyPullRequest, 'mark ready').head.sha,
      firstReadiness: this.required(this.reviewChanges, 'review changes').classification,
      responseStatus: this.required(this.responses, 'response').threads[0]?.status,
      resolutionStatus: this.required(this.resolutions, 'resolution').threads[0]?.status,
      secondReadiness: this.required(this.clean, 'clean readiness').classification,
      merge: this.required(this.merged, 'merge'),
      githubMutations: this.github.mutations,
    };
  }

  dynamicFacts(): ConsumerPullRequestLifecycleDynamicFacts {
    const status = this.required(this.statusResult, 'status');
    return {
      baseCapture: status.baseCapture,
      headCapture: status.headCapture,
      headCommit: this.required(this.committed, 'commit').headCommit,
    };
  }

  async dispose(): Promise<void> {
    await this.git.dispose();
  }

  private gitBindings(
    access: 'read' | 'write' | 'publish',
    permission: string,
    effects: readonly ('filesystem.read' | 'git.read' | 'git.write' | 'git.remote-write')[],
  ) {
    return consumerFlowBindings({
      repositoryId: this.git.repositoryId,
      workspaceId: this.git.workspaceId,
      access,
      permission,
      effects,
    });
  }
  private githubBindings(
    access: 'read' | 'publish',
    permission: string,
    effects: readonly ('github.read' | 'github.write')[],
  ) {
    return consumerFlowBindings({
      repositoryId: this.git.repositoryId,
      access,
      permission,
      effects,
      github: true,
    });
  }
  private required<T>(value: T | undefined, step: string): T {
    if (value === undefined) {
      throw new Error(`Consumer flow requires ${step}.`);
    }
    return value;
  }
}

const captureValue = (capture: string, prefix: string): string => {
  if (!capture.startsWith(prefix)) {
    throw new Error(`Expected ${prefix} capture.`);
  }
  return capture.slice(prefix.length);
};
