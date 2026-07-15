import { expect, test } from 'vitest';

import { builtInScripts } from '../../../src/application/registration/built-ins.js';
import type { GitCommitClient, GitPushClient } from '../../../src/providers/git/index.js';
import type {
  GitHubPullRequestMergeClient,
  GitHubPullRequestReadyClient,
  GitHubPullRequestUpsertClient,
  GitHubReviewThreadResolveClient,
  GitHubReviewThreadRespondClient,
} from '../../../src/providers/github/index.js';
import type { ScriptDefinition } from '../../../src/runtime/spec/definition/index.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';
import { gitCommitScript, gitPushScript } from '../../../src/scripts/git/index.js';
import {
  githubPullRequestMarkReadyScript,
  githubPullRequestMergeScript,
  githubPullRequestUpsertScript,
  githubReviewThreadResolveScript,
  githubReviewThreadRespondScript,
} from '../../../src/scripts/github/index.js';
import {
  createScriptContractHarness,
  verifyRequiredIdempotencyContracts,
  type RequiredIdempotencyScenario,
} from '../../../src/testing/index.js';
import { githubResource, pullRequest } from '../../support/github/github-contract-fixture.js';
import {
  githubReviewThreadMarker,
  githubReviewThreadMarkerFingerprint,
} from '../../support/github/github-review-thread-marker-fixture.js';

const parent = '0'.repeat(40);
const tree = '1'.repeat(40);
const head = '2'.repeat(40);
const mergeCommit = '3'.repeat(40);

const registeredBuiltIns = (): ScriptDefinition<unknown, unknown, ScriptResourceMap>[] => {
  const definitions: ScriptDefinition<unknown, unknown, ScriptResourceMap>[] = [];
  builtInScripts().registerInto({ register: (definition) => definitions.push(definition) });
  return definitions;
};

const scenario = <O>(
  scriptId: string,
  execute: () => Promise<
    Awaited<
      ReturnType<ReturnType<typeof createScriptContractHarness<O, O, ScriptResourceMap>>['execute']>
    >
  >,
  adoptedResult: RequiredIdempotencyScenario<O>['adoptedResult'],
  mutationCount: () => number,
): RequiredIdempotencyScenario<O> => ({ scriptId, execute, adoptedResult, mutationCount });

const commitScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  const client: GitCommitClient = {
    commit: async () => {
      mutations += mutations === 0 ? 1 : 0;
      return {
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task',
        baseCommit: parent,
        headCommit: head,
        commits: [head],
      };
    },
  };
  const harness = createScriptContractHarness(gitCommitScript, {
    idempotencyKey: 'crash:git-commit',
    resources: { repository: { ...gitResource(client, 'write'), clients: { git: client } } },
  });
  const value = {
    schemaVersion: 'git-change/v1' as const,
    repositoryId: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task',
    baseCommit: parent,
    headCommit: head,
    commits: [head],
  };
  return scenario(
    'script:git/commit',
    async () =>
      await harness.execute({
        resource: 'repository',
        remoteIdentity: value.remoteIdentity,
        branch: value.branch,
        expectedParent: parent,
        expectedTree: tree,
        title: 'crash recovery',
        issueAction: 'none',
        author: {
          name: 'Revisium Bot',
          email: 'bot@revisium.io',
          timestamp: '2026-07-15T09:00:00.000Z',
        },
      }),
    { ok: true, value, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const pushScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  let calls = 0;
  const client: GitPushClient = {
    push: async () => {
      calls += 1;
      mutations += mutations === 0 ? 1 : 0;
      return { status: calls === 1 ? 'pushed' : 'already-published', remoteHead: head };
    },
  };
  const change = {
    schemaVersion: 'git-change/v1' as const,
    repositoryId: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task',
    baseCommit: parent,
    headCommit: head,
    commits: [head],
  };
  const harness = createScriptContractHarness(gitPushScript, {
    idempotencyKey: 'crash:git-push',
    resources: { repository: { ...gitResource(client, 'publish'), clients: { git: client } } },
  });
  return scenario(
    'script:git/push',
    async () => await harness.execute({ change, expectedRemoteHead: parent }),
    { ok: true, value: change, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const upsertSnapshot = (draft: boolean) => ({
  number: pullRequest.number,
  nodeId: pullRequest.pullRequestId,
  url: pullRequest.url,
  head: pullRequest.head,
  base: pullRequest.base,
  title: 'Crash recovery',
  body: 'Body',
  providerRevision: pullRequest.providerRevision,
  state: 'open' as const,
  draft,
});

const upsertScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  const client: GitHubPullRequestUpsertClient = {
    upsert: async () => {
      mutations += mutations === 0 ? 1 : 0;
      return upsertSnapshot(true);
    },
  };
  const harness = createScriptContractHarness(githubPullRequestUpsertScript, {
    idempotencyKey: 'crash:upsert',
    resources: { repository: githubResource(client, 'publish') },
  });
  return scenario(
    'script:github/pull-request/upsert',
    async () =>
      await harness.execute({
        repositoryId: pullRequest.repositoryId,
        owner: pullRequest.owner,
        repository: pullRequest.repository,
        head: pullRequest.head,
        base: pullRequest.base,
        title: 'Crash recovery',
        body: 'Body',
        draft: true,
        issueAction: 'none',
      }),
    { ok: true, value: pullRequest, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const markReadyScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  const readyPullRequest = { ...pullRequest, draft: false };
  const client: GitHubPullRequestReadyClient = {
    markReady: async () => {
      mutations += mutations === 0 ? 1 : 0;
      return upsertSnapshot(false);
    },
  };
  const harness = createScriptContractHarness(githubPullRequestMarkReadyScript, {
    idempotencyKey: 'crash:mark-ready',
    resources: { repository: githubResource(client, 'publish') },
  });
  return scenario(
    'script:github/pull-request/mark-ready',
    async () => await harness.execute({ pullRequest }),
    { ok: true, value: readyPullRequest, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const responseInput = () => ({
  schemaVersion: 'github-review-threads-respond-input/v1' as const,
  pullRequest,
  triage: { items: [{ threadId: 'thread-1', decision: 'fix' as const, replyText: 'Addressed.' }] },
});
const responseProof = (status: 'replied' | 'already-replied') => {
  const marker = githubReviewThreadMarker({
    operationKey: 'crash:respond',
    pullRequestNumber: pullRequest.number,
    headCommit: pullRequest.head.sha,
    threadId: 'thread-1',
    replyBody: 'Addressed.',
  });
  return {
    threadId: 'thread-1',
    disposition: 'fix' as const,
    status,
    replyId: 'reply-1',
    marker,
    markerFingerprint: githubReviewThreadMarkerFingerprint(marker),
  };
};

const respondScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  let calls = 0;
  const client: GitHubReviewThreadRespondClient = {
    respondBatch: async () => {
      calls += 1;
      mutations += mutations === 0 ? 1 : 0;
      return [responseProof(calls === 1 ? 'replied' : 'already-replied')];
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadRespondScript, {
    idempotencyKey: 'crash:respond',
    resources: { repository: githubResource(client, 'publish') },
  });
  const value = {
    schemaVersion: 'github-review-threads-respond-result/v1' as const,
    pullRequest: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: pullRequest.number,
      headCommit: pullRequest.head.sha,
    },
    threads: [responseProof('already-replied')],
  };
  return scenario(
    'script:github/review-threads/respond',
    async () => await harness.execute(responseInput()),
    { ok: true, value, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const resolveScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  let calls = 0;
  const proof = responseProof('replied');
  const client: GitHubReviewThreadResolveClient = {
    resolveBatch: async () => {
      calls += 1;
      mutations += mutations === 0 ? 1 : 0;
      return [
        {
          threadId: proof.threadId,
          status: calls === 1 ? 'resolved' : 'already-resolved',
          replyId: proof.replyId,
          marker: proof.marker,
          markerFingerprint: proof.markerFingerprint,
        },
      ];
    },
  };
  const harness = createScriptContractHarness(githubReviewThreadResolveScript, {
    idempotencyKey: 'crash:resolve',
    resources: { repository: githubResource(client, 'publish') },
  });
  const value = {
    schemaVersion: 'github-review-threads-resolve-result/v1' as const,
    pullRequest: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: pullRequest.number,
      headCommit: pullRequest.head.sha,
    },
    threads: [
      {
        threadId: proof.threadId,
        status: 'already-resolved' as const,
        replyId: proof.replyId,
        marker: proof.marker,
        markerFingerprint: proof.markerFingerprint,
      },
    ],
  };
  return scenario(
    'script:github/review-threads/resolve',
    async () =>
      await harness.execute({
        schemaVersion: 'github-review-threads-resolve-input/v1',
        pullRequest,
        responses: {
          schemaVersion: 'github-review-threads-respond-result/v1',
          pullRequest: value.pullRequest,
          threads: [proof],
        },
      }),
    { ok: true, value, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const mergeInput = () => ({
  pullRequest: { ...pullRequest, draft: false },
  approvalSubject: {
    schemaVersion: 'approval-subject/v1' as const,
    kind: 'publication' as const,
    identity: {
      scheme: 'uri' as const,
      value: `github://${pullRequest.owner}/${pullRequest.repository}/pull/${pullRequest.number}`,
    },
    revision: { scheme: 'git-commit' as const, value: pullRequest.head.sha },
    title: 'Merge the approved pull request',
    summary: 'Merge only the exact approved head.',
    evidence: [],
    risk: 'Publishes the approved change.',
  },
  gateResolution: {
    schemaVersion: 'gate-resolution/v1' as const,
    inboxId: 'merge-gate-1',
    resolution: {
      mode: 'subject-approval' as const,
      status: 'active' as const,
      outcome: 'approved' as const,
      decidedAt: '2026-07-14T00:00:00.000Z',
      decidedBy: 'reviewer',
      subject: {
        outputNode: 'approval-subject',
        outputOrdinal: 0,
        identity: {
          scheme: 'uri',
          value: `github://${pullRequest.owner}/${pullRequest.repository}/pull/${pullRequest.number}`,
        },
        revision: { scheme: 'git-commit', value: pullRequest.head.sha },
        executionPlanHash: 'sha256:approved-plan',
      },
    },
  },
  readiness: {
    schemaVersion: 'github-readiness/v1' as const,
    repositoryId: pullRequest.repositoryId,
    pullRequest: {
      owner: pullRequest.owner,
      repository: pullRequest.repository,
      number: pullRequest.number,
      url: pullRequest.url,
    },
    observedAt: '2026-07-14T00:01:00.000Z',
    providerRevision: 'github-readiness/v1:crash',
    headCommit: pullRequest.head.sha,
    state: 'open' as const,
    draft: false,
    mergeable: 'mergeable' as const,
    mergeState: 'CLEAN',
    checks: [],
    unresolvedThreads: [],
    completeness: {
      checks: 'complete' as const,
      requiredChecks: 'complete' as const,
      threads: 'complete' as const,
    },
    advisory: [],
    classification: 'clean' as const,
  },
});

const mergeScenario = (): RequiredIdempotencyScenario<unknown> => {
  let mutations = 0;
  let calls = 0;
  const client: GitHubPullRequestMergeClient = {
    merge: async () => {
      calls += 1;
      mutations += mutations === 0 ? 1 : 0;
      return {
        pullRequest: {
          ...upsertSnapshot(false),
          state: 'merged' as const,
          mergeCommitSha: mergeCommit,
        },
        status: calls === 1 ? 'merged' : 'already-merged',
        sourceBranchDeleted: true,
      };
    },
  };
  const harness = createScriptContractHarness(githubPullRequestMergeScript, {
    idempotencyKey: 'crash:merge',
    resources: { repository: githubResource(client, 'publish') },
  });
  const value = {
    schemaVersion: 'github-pull-request-merge-result/v1' as const,
    repositoryId: pullRequest.repositoryId,
    owner: pullRequest.owner,
    repository: pullRequest.repository,
    number: pullRequest.number,
    pullRequestId: pullRequest.pullRequestId,
    url: pullRequest.url,
    approvedHeadCommit: pullRequest.head.sha,
    mergedHeadCommit: pullRequest.head.sha,
    mergeCommit,
    method: 'squash' as const,
    status: 'already-merged' as const,
    sourceBranchDeleted: true as const,
  };
  return scenario(
    'script:github/pull-request/merge',
    async () => await harness.execute(mergeInput()),
    { ok: true, value, evidence: [], attempts: 1 },
    () => mutations,
  );
};

const gitResource = <T extends object>(client: T, access: 'write' | 'publish') => ({
  name: 'repository' as const,
  kind: 'repository' as const,
  access,
  grant: {
    permissions: access === 'write' ? ['git.commit.write'] : ['git.push.publish'],
    effects:
      access === 'write'
        ? (['git.read', 'git.write'] as const)
        : (['git.read', 'git.remote-write'] as const),
  },
  clients: { git: client },
});

test('executes every registry-derived required write through crash reconciliation', async () => {
  await expect(
    verifyRequiredIdempotencyContracts(registeredBuiltIns(), [
      commitScenario(),
      pushScenario(),
      upsertScenario(),
      markReadyScenario(),
      respondScenario(),
      resolveScenario(),
      mergeScenario(),
    ]),
  ).resolves.toBeUndefined();
  await expect(
    verifyRequiredIdempotencyContracts(registeredBuiltIns(), [
      pushScenario(),
      upsertScenario(),
      markReadyScenario(),
      respondScenario(),
      resolveScenario(),
      mergeScenario(),
    ]),
  ).rejects.toThrow('missing: script:git/commit');
});
