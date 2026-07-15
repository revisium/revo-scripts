<div align="center">

# @revisium/revo-scripts

**Bounded, versioned Git and GitHub operations behind one generic host API.**

[![CI](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> [!IMPORTANT]
> The package is not published. The contracts and implementations in this repository are reviewable pre-release API.

## Responsibility

`@revisium/revo-scripts` owns definitions and execution of one bounded operation. A built-in script owns its closed
input and result schemas, manifest, stale-state fences, idempotency behavior, provider calls, error mapping, and domain
result. The consumer chooses an exact script, supplies logical bindings and grants, then receives a typed result or a
structured failure.

The package owns:

- exact script registration and single-script execution;
- timeout, bounded retry, idempotency, permissions, events, redaction, and payload limits;
- package-owned Git and GitHub provider adapters;
- bounded Git status, commit, push, pull-request, review-thread, merge, and approval-subject operations;
- contract and consumer test mechanics.

The host owns:

- pipeline routing and durable state;
- workspace allocation and release;
- credential storage and account-selection policy;
- logical bindings and grants for one execution;
- event and artifact persistence;
- human gates and decisions made after a script result.

Handlers never receive an absolute workspace path, token, process executor, generic HTTP/GraphQL client, DBOS,
Prisma, NestJS, or pipeline service. Those values remain private inside trusted provider adapters.

## Architecture

```text
pipeline data
  exact script id/version + domain input + logical grants
                           |
                           v
createRevoScripts().execute(request)
  -> exact definition and provider-pin validation
  -> host resolves opaque workspace/credential bindings
  -> package provider constructs one operation-specific client
  -> handler performs one bounded operation
  -> schema-validated domain result or structured failure
```

The dependency direction is deliberate:

```text
runtime/spec <- runtime/{definition,registry,execution}
runtime/spec <- host
runtime/spec <- providers/*/contracts <- scripts/*
host + providers/*/contracts <- providers/*/adapters
runtime + host + providers + scripts <- application facade
```

Scripts import bounded provider contracts, never adapters. Adapters import no concrete script. Runtime execution knows
neither Git nor GitHub. See [REPOSITORY.md](REPOSITORY.md),
[ADR-0001](docs/adr/0001-script-sdk-and-runtime-boundary.md), and
[script-runtime-v1.spec.md](docs/specs/script-runtime-v1.spec.md).

## Consumer integration

### Compose once at startup

```ts
import { createRevoScripts, gitScripts, githubScripts } from '@revisium/revo-scripts';
import { nodeGitProviders } from '@revisium/revo-scripts/providers/git';
import { fetchGitHubProviders } from '@revisium/revo-scripts/providers/github';

const scripts = createRevoScripts({
  definitions: [gitScripts(), githubScripts()],
  providers: [...nodeGitProviders({ processExecutor }), ...fetchGitHubProviders()],
  host: {
    workspaces: workspaceResolver,
    credentials: credentialResolver,
    events: eventSink,
    clock,
  },
});
```

`approvalScripts()`, `gitScripts()`, and `githubScripts()` let a host install only the families it uses.
`builtInScripts()` registers every built-in and therefore requires providers for every provider-backed family. There
is no filesystem scanning or
per-script `registry.register(...)` wiring in consumer code.

`processExecutor` is a host infrastructure seam for argv-safe process spawning. The Node Git adapter receives only
`{ command, args, cwd, maxOutputBytes, environment?, signal }`. A script never sees that interface. The Fetch GitHub
adapter owns REST/GraphQL request construction and receives a short-lived token resolved through the host credential
port.

### Compile an exact plan

```ts
const executable = scripts.resolveForPlan({
  id: 'script:github/pull-request/upsert',
  version: '1.0.0',
});
```

The descriptor contains an exact definition digest, the manifest, and exact provider implementation pins. Pipeline
data names only the script id/version; it never selects a provider implementation or carries a path or token.

### Execute through one generic path

```ts
const result = await scripts.execute({
  executionId: 'run-123:open-pr:1',
  idempotencyKey: 'run-123:open-pr',
  script: executable.script,
  providers: executable.providers,
  input: {
    repositoryId: 'repository-123',
    head: { branch: 'revo/task-123', sha: 'a'.repeat(40) },
    base: { branch: 'master' },
    title: 'Add bounded operation',
    body: 'Implements the approved change.',
    draft: true,
  },
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: 'repository-123',
        access: 'write',
        grant: {
          permissions: ['github.pull-request.upsert'],
          effects: ['github.read', 'github.write'],
        },
        providerCoordinates: {
          github: { owner: 'revisium', repository: 'revo-scripts' },
        },
      },
    },
    credentials: {
      token: { alias: 'github-publication-account', provider: 'github' },
    },
  },
  signal,
});

if (result.ok) {
  await consumeDomainResult(result.value);
} else {
  await handleScriptFailure(result.error);
}
```

The executor contains no branch for `script:github/pull-request/upsert`. Adding another operation that uses
`revo.provider.github/v1` changes this package and pipeline data, not the host executor.

## Result contracts

Results are bounded domain values. They intentionally contain no `runId`, `nodeId`, `attemptId`, `workspaceId`,
execution-plan hash, artifact identity, or provenance.

### Workspace change

`script:git/status@1.0.0` returns the exact base commit and a tree captured from the current workspace without mutating
the real Git index:

```json
{
  "schemaVersion": "workspace-change/v1",
  "baseCapture": "git-commit:0123456789abcdef0123456789abcdef01234567",
  "headCapture": "git-tree:89abcdef0123456789abcdef0123456789abcdef",
  "changedPaths": [
    { "path": "src/index.ts", "status": "modified" },
    { "path": "test/new.test.ts", "status": "untracked" }
  ],
  "clean": false
}
```

### Git change

`script:git/commit` creates exactly the approved tree using an exact parent fence and explicit deterministic
authorship (`name`, `email`, and timestamp). `script:git/push` accepts and returns the same payload, publishes only its
pinned head, never rewrites history, and rejects a remote head other than the expected base:

```json
{
  "schemaVersion": "git-change/v1",
  "repositoryId": "repository-123",
  "remoteIdentity": "github.com/revisium/revo-scripts",
  "branch": "revo/task-123",
  "baseCommit": "0123456789abcdef0123456789abcdef01234567",
  "headCommit": "fedcba9876543210fedcba9876543210fedcba98",
  "commits": ["fedcba9876543210fedcba9876543210fedcba98"]
}
```

### GitHub pull request and readiness

Pull-request mutations return `github-pull-request/v1` with `pullRequestId`, number, URL, and exact head identity:

```json
{
  "schemaVersion": "github-pull-request/v1",
  "repositoryId": "repository-123",
  "number": 42,
  "pullRequestId": "PR_kwDOExample",
  "url": "https://github.com/revisium/revo-scripts/pull/42",
  "head": {
    "branch": "revo/task-123",
    "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "base": { "branch": "master" },
  "state": "open",
  "draft": true
}
```

Readiness is a separate read-only result so policy blockers remain explicit:

```json
{
  "schemaVersion": "github-readiness/v1",
  "repositoryId": "repository-123",
  "pullRequest": {
    "owner": "revisium",
    "repository": "revo-scripts",
    "number": 42,
    "url": "https://github.com/revisium/revo-scripts/pull/42"
  },
  "headCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "providerRevision": "github-readiness/v1:sha256:...",
  "completeness": { "checks": "complete", "requiredChecks": "complete", "threads": "complete" },
  "classification": "clean"
}
```

When a manifest declares `classification`, it is a generic RFC 6901 pointer into the validated result. The readiness
operation uses `/classification` (`clean`, `recheck`, `ci_changes`, `review_changes`, `closed`, `merged`, or
`unclassifiable`); consumers do not branch on a script id. A moved pull-request head is recorded as the observed
head, not rejected as stale input. Required-check identity, check collection, and thread collection each report their
own bounded completeness evidence. The Fetch provider combines matching branch protection with GitHub's
credential-scoped evaluated branch rules, including repository and organization rulesets; unavailable or truncated
identity is never treated as zero configured checks.

### Pull-request merge

`script:github/pull-request/merge` accepts the exact PR artifact, approval subject, active gate resolution, and a
post-gate readiness artifact. It returns a dedicated merge receipt rather than a mutable PR artifact:

```json
{
  "schemaVersion": "github-pull-request-merge-result/v1",
  "repositoryId": "repository-123",
  "owner": "revisium",
  "repository": "revo-scripts",
  "number": 42,
  "pullRequestId": "PR_kwDOExample",
  "url": "https://github.com/revisium/revo-scripts/pull/42",
  "approvedHeadCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "mergedHeadCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "mergeCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "method": "squash",
  "status": "merged",
  "sourceBranchDeleted": true
}
```

The operation accepts only clean normal approval, or an override with bounded advisory evidence and an exact sorted
unresolved-thread audit. It asks GitHub to squash-merge the exact head, deletes the exact source ref, then reads back
the merged PR and source-branch state. An exact already-merged PR is adopted without another merge request.

Review-thread operations use independent ordered batches. Response returns only selected `fix`/`wontfix` thread proofs;
resolution consumes those proofs and reports its separate status. Neither result exposes reply body, actor identity, or
raw provider data:

```json
{
  "schemaVersion": "github-review-threads-respond-result/v1",
  "pullRequest": {
    "owner": "revisium",
    "repository": "revo-scripts",
    "number": 42,
    "headCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "threads": [
    {
      "threadId": "PRRT_kwDOExample",
      "disposition": "fix",
      "status": "replied",
      "replyId": "PRRC_kwDOExample",
      "marker": "<!-- revo-thread-reply:v1 key=sha256:... -->",
      "markerFingerprint": "sha256:..."
    }
  ]
}
```

## Recovery and consumer proof

The public testing entrypoint derives required crash-reconciliation scenarios from the sealed built-in registry. Every
write executes once with its host result lost, then again with the same key, proving one mutation and its exact typed
adopted result. The suite covers Git commit/push, PR upsert/mark-ready/merge, and review response/resolution batches.

### Approval subject

The provider-neutral approval helper normalizes the exact subject a host can place behind its own human gate:

```json
{
  "schemaVersion": "approval-subject/v1",
  "kind": "publication",
  "identity": { "scheme": "github-pull-request", "value": "revisium/revo-scripts#42" },
  "revision": { "scheme": "git-commit", "value": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "title": "Publish bounded Git and GitHub scripts",
  "summary": "Review the exact pull-request head before publication.",
  "evidence": [
    {
      "identity": { "scheme": "script-result", "value": "github-readiness/v1:repository-123#42" },
      "title": "GitHub readiness"
    }
  ],
  "risk": "Creates or updates external GitHub state."
}
```

Every result schema is closed and size-bounded. Structured failures use stable `revo.script.*` codes and are returned
as `{ ok: false, error, attempts }`; they are not encoded inside these domain values:

```json
{
  "ok": false,
  "error": {
    "code": "revo.script.idempotency.conflict",
    "message": "The observed pull-request head does not match the requested head.",
    "retryable": false,
    "details": { "expectedHeadSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  },
  "attempts": 1
}
```

### Host artifact envelope

The package returns only the validated value above. A durable host may wrap it after execution using the exact schema
identity compiled into its plan:

```ts
const artifactEnvelope = {
  artifactId: hostAllocatedArtifactId,
  schema: {
    schemaId: executable.manifest.resultSchemaId,
    version: 'v1',
    digest: compiledResultSchema.digest,
  },
  value: { kind: 'inline', data: result.value },
  provenance: {
    runId,
    nodeId,
    ordinal,
    attemptId,
    workspaceId,
    executionPlanHash,
  },
};
```

`ArtifactEnvelope` and `OutputProvenance` belong to the orchestrator/host, not this package. The host performs this
generic wrapping from the plan and execution context; it must not map concrete script ids or duplicate provenance
inside a script payload.

## Built-in operations

| Script                                        | Effect  | Result schema                            | Safety fence                                                                        |
| --------------------------------------------- | ------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `script:approval/subject@1.0.0`               | pure    | `schema:approvalSubject/v1`              | closed provider-neutral input                                                       |
| `script:git/status@1.0.0`                     | read    | `schema:workspaceChange/v1`              | immutable commit/tree captures                                                      |
| `script:git/commit@1.0.0`                     | write   | `schema:gitChange/v1`                    | exact parent/tree + operation marker                                                |
| `script:git/push@1.0.0`                       | publish | `schema:gitChange/v1`                    | ancestry proof + exact remote-head CAS lease                                        |
| `script:github/pull-request/upsert@1.0.0`     | publish | `schema:githubPullRequest/v1`            | head/draft fence + metadata reconciliation                                          |
| `script:github/pull-request/mark-ready@1.0.0` | publish | `schema:githubPullRequest/v1`            | exact PR head                                                                       |
| `script:github/pull-request/readiness@1.0.0`  | read    | `schema:githubReadiness/v1`              | exact PR head                                                                       |
| `script:github/review-threads/respond@1.0.0`  | publish | `schema:githubReviewThreadsRespond/v1`   | selected PR/head + canonical reply marker/readback                                  |
| `script:github/review-threads/resolve@1.0.0`  | publish | `schema:githubReviewThreadsResolve/v1`   | response proof + exact resolution readback                                          |
| `script:github/pull-request/merge@1.0.0`      | publish | `schema:githubPullRequestMergeResult/v1` | approval/readiness equality, exact-head squash, and source-branch deletion readback |

## Versioning

Four identities stay separate:

| Identity                | Example                        | Purpose                                 |
| ----------------------- | ------------------------------ | --------------------------------------- |
| npm package             | `@revisium/revo-scripts@0.0.0` | current unreleased package metadata     |
| script                  | `script:git/status@1.0.0`      | immutable observable operation contract |
| provider contract       | `revo.provider.git/v1`         | bounded client protocol compatibility   |
| provider implementation | `provider:git/node` + digest   | exact adapter pinned into a plan        |

Pipeline data uses an exact script version, never a range or `latest`. Folder names are not version identities. The
repository currently retains one implementation of each script. Coexisting source implementations of two versions
remain a separate design decision and are not simulated with version folders or compatibility fallbacks.

## Public entrypoints

| Entrypoint                                | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `@revisium/revo-scripts`                  | facade and trusted definition-family factories                |
| `@revisium/revo-scripts/spec`             | portable manifest, result, error, event, and schema contracts |
| `@revisium/revo-scripts/runtime`          | low-level definition, registry, and execution API             |
| `@revisium/revo-scripts/host`             | trusted host/provider integration contracts                   |
| `@revisium/revo-scripts/approval`         | approval-subject definition and types                         |
| `@revisium/revo-scripts/git`              | Git definitions and domain types                              |
| `@revisium/revo-scripts/github`           | GitHub definitions and domain types                           |
| `@revisium/revo-scripts/providers/git`    | Node Git provider factory and bounded contracts               |
| `@revisium/revo-scripts/providers/github` | Fetch GitHub provider factory and bounded contracts           |
| `@revisium/revo-scripts/testing`          | reusable contract harness and fakes                           |

Deep imports outside this export map are unsupported. The root deliberately does not re-export individual scripts,
provider adapters, testing mechanics, or every internal type.

## Verification

```bash
corepack pnpm verify
```

The root gate includes format, TypeScript, zero-warning lint, unit/contract/integration/package tests, coverage,
architecture boundaries, build, declarations and exports, package content, and packed-consumer validation. Exact
commands and Sonar behavior are in [VERIFICATION.md](VERIFICATION.md); test authoring rules are in
[docs/testing.md](docs/testing.md).
