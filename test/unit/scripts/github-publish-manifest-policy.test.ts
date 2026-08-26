import { expect, test } from 'vitest';

import type { ScriptManifestV1 } from '../../../src/runtime/spec/manifest/index.js';
import { githubPullRequestMarkReadyManifest } from '../../../src/scripts/github/pull-request/mark-ready/manifest.js';
import { githubPullRequestMergeManifest } from '../../../src/scripts/github/pull-request/merge/manifest.js';
import { githubPullRequestReadinessManifest } from '../../../src/scripts/github/pull-request/readiness/manifest.js';
import { githubPullRequestUpsertManifest } from '../../../src/scripts/github/pull-request/upsert/manifest.js';
import { githubReviewThreadResolveManifest } from '../../../src/scripts/github/review-thread/resolve/manifest.js';
import { githubReviewThreadRespondManifest } from '../../../src/scripts/github/review-thread/respond/manifest.js';
import { githubPublishManifestPolicyV1 } from '../../../src/scripts/github/shared/github-publish-manifest-policy-v1.js';

interface PublishManifestFacts {
  readonly id: `script:github/${string}`;
  readonly summary: string;
  readonly inputSchemaId: string;
  readonly resultSchemaId: string;
  readonly permission: string;
  readonly wallClockMs: number;
  readonly maxAttempts: number;
  readonly backoffMs: readonly number[];
}

const expectedPublishManifest = (facts: PublishManifestFacts): ScriptManifestV1 => ({
  schemaVersion: 'revo.script.manifest/v1',
  id: facts.id,
  version: 1,
  summary: facts.summary,
  inputSchemaId: facts.inputSchemaId,
  resultSchemaId: facts.resultSchemaId,
  impactClass: 'publish',
  permissions: [facts.permission],
  resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  operations: ['github.read', 'github.write'],
  timeout: { wallClockMs: facts.wallClockMs },
  retry: {
    mode: 'transient',
    maxAttempts: facts.maxAttempts,
    backoffMs: facts.backoffMs,
  },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
});

const publishManifestCases = [
  {
    manifest: githubPullRequestUpsertManifest,
    facts: {
      id: 'script:github/pull-request/upsert',
      summary: 'Creates or reconciles one pull request at an exact head revision.',
      inputSchemaId: 'revo.script.github.pull-request.upsert.input/v1',
      resultSchemaId: 'schema:githubPullRequest/v1',
      permission: 'github.pull-request.upsert',
      wallClockMs: 30_000,
      maxAttempts: 2,
      backoffMs: [500],
    },
  },
  {
    manifest: githubPullRequestMarkReadyManifest,
    facts: {
      id: 'script:github/pull-request/mark-ready',
      summary: 'Marks one exact draft pull request revision ready for review.',
      inputSchemaId: 'revo.script.github.pull-request.mark-ready.input/v1',
      resultSchemaId: 'schema:githubPullRequest/v1',
      permission: 'github.pull-request.mark-ready',
      wallClockMs: 20_000,
      maxAttempts: 2,
      backoffMs: [500],
    },
  },
  {
    manifest: githubPullRequestMergeManifest,
    facts: {
      id: 'script:github/pull-request/merge',
      summary: 'Merges one pull request only when its head matches the pinned revision.',
      inputSchemaId: 'revo.script.github.pull-request.merge.input/v1',
      resultSchemaId: 'schema:githubPullRequestMergeResult/v1',
      permission: 'github.pull-request.merge',
      wallClockMs: 60_000,
      maxAttempts: 3,
      backoffMs: [250, 1_000],
    },
  },
  {
    manifest: githubReviewThreadRespondManifest,
    facts: {
      id: 'script:github/review-threads/respond',
      summary: 'Replies once to each selected review thread on an exact pull request head.',
      inputSchemaId: 'revo.script.github.review-thread.respond.input/v1',
      resultSchemaId: 'schema:githubReviewThreadsRespond/v1',
      permission: 'github.review-thread.respond',
      wallClockMs: 60_000,
      maxAttempts: 3,
      backoffMs: [250, 1_000],
    },
  },
  {
    manifest: githubReviewThreadResolveManifest,
    facts: {
      id: 'script:github/review-threads/resolve',
      summary: 'Resolves only review threads backed by exact response proofs.',
      inputSchemaId: 'revo.script.github.review-thread.resolve.input/v1',
      resultSchemaId: 'schema:githubReviewThreadsResolve/v1',
      permission: 'github.review-thread.resolve',
      wallClockMs: 60_000,
      maxAttempts: 3,
      backoffMs: [250, 1_000],
    },
  },
] as const;

test.each(publishManifestCases)(
  'keeps the complete $facts.id manifest contract exact',
  ({ manifest, facts }) => {
    expect(manifest).toEqual(expectedPublishManifest(facts));
  },
);

test('keeps readiness outside the publish policy', () => {
  expect(githubPullRequestReadinessManifest).toEqual({
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:github/pull-request/readiness',
    version: 1,
    summary: 'Observes one bounded pull-request readiness snapshot.',
    inputSchemaId: 'revo.script.github.pull-request.readiness.input/v1',
    resultSchemaId: 'schema:githubReadiness/v1',
    impactClass: 'read',
    permissions: ['github.pull-request.readiness'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
    credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
    operations: ['github.read'],
    timeout: { wallClockMs: 30_000 },
    retry: { mode: 'transient', maxAttempts: 3, backoffMs: [250, 1_000] },
    idempotency: 'read-only',
    classification: '/classification',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  });
});

test('creates isolated policy collections from explicit varying contract facts', () => {
  const facts = {
    permission: 'github.pull-request.upsert',
    wallClockMs: 30_000,
    maxAttempts: 2,
    backoffMs: [500],
  } as const;
  const first = githubPublishManifestPolicyV1(facts);
  const second = githubPublishManifestPolicyV1(facts);

  expect(first).toEqual({
    impactClass: 'publish',
    permissions: ['github.pull-request.upsert'],
    resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
    providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
    credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
    operations: ['github.read', 'github.write'],
    timeout: { wallClockMs: 30_000 },
    retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
    idempotency: 'required',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  });
  expect(first.permissions).not.toBe(second.permissions);
  expect(first.retry).not.toBe(second.retry);
  expect(first.retry.backoffMs).not.toBe(second.retry.backoffMs);
  expect(first.redaction).not.toBe(second.redaction);
  expect(first.events).not.toBe(second.events);
});
