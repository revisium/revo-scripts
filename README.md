<div align="center">

# @revisium/revo-scripts

**Bounded, versioned Git and GitHub operations behind one generic host API.**

[![CI](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> [!IMPORTANT]
> Pre-release package. It is not published to npm; the API and built-in operations remain under review.

## About

`@revisium/revo-scripts` defines and executes one bounded operation. It owns versioned script definitions, schema
validation, provider adapters, permissions and effects, timeout and retry policy, idempotency, event redaction, and
structured results. The current built-ins cover Git, GitHub pull requests, review threads, merge, and approval subject
operations.

The consumer owns pipeline routing, durable state, workspace lifecycle, credential storage, grants, event/artifact
persistence, and human gates. It creates one facade and never implements a script-specific dispatch branch.

Built-in families are released with this package: `git/status`, `git/commit`, `git/push`, GitHub pull-request
operations, GitHub review-thread operations, pull-request merge, and `approval/subject`. Each operation has an exact
id, version, manifest, schemas, provider requirements, and bounded result. The package does not scan the filesystem to
find additional definitions.

## Quick start

Create the facade once. The package registers built-in definitions and package-owned Git/GitHub providers; the consumer
supplies only its host ports.

```ts
import { createRevoScripts } from '@revisium/revo-scripts';

const scripts = createRevoScripts({
  workspaces: workspaceResolver,
  credentials: credentialResolver,
  events: eventSink,
  clock,
});

const plan = scripts.resolveForPlan({
  id: 'script:git/status',
  version: '1.0.0',
});

const result = await scripts.execute({
  executionId: 'run-123:git-status:1',
  idempotencyKey: 'run-123:git-status',
  script: plan.script,
  providers: plan.providers,
  input: {
    resource: 'repository',
    baseCapture: `git-commit:${'0'.repeat(40)}`,
    headCapture: `git-tree:${'1'.repeat(40)}`,
  },
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: 'repository-123',
        access: 'read',
        grant: { permissions: ['git.status'], effects: ['filesystem.read', 'git.read'] },
      },
    },
    credentials: {},
  },
  signal: new AbortController().signal,
});

if (result.ok) {
  consumeStatus(result.value);
} else {
  reportFailure(result.error.code, result.error.message);
}
```

`RevoScriptExecutionRequest` and the exact binding rules are defined in the [runtime specification](docs/specs/script-runtime-v1.spec.md).
The consumer passes data and grants; it does not construct a Git client, choose a provider implementation, or branch on
`script:git/status`.

For mutation operations, the input includes the relevant stale-state fence and idempotency key. The central pipeline
may decide what to do after the returned result, but the script performs only its one bounded operation.

## Data-driven scripts

- Scripts are versioned definitions.
- A definition contains a manifest, input/result schemas, permissions/effects, and provider requirements.
- The pipeline selects an exact script id/version and passes input, bindings, and grants.
- The consumer uses one generic executor for every script; it has no per-script executor or dispatch branch.
- Provider contracts, adapters, validation, retries, redaction, and execution belong to this npm package.
- A new script on an existing provider family requires a package change, package release, and new exact plan reference,
  but not a generic consumer executor change.
- A new provider contract, transport, or privileged behavior requires package implementation and a new release.
- Automatic filesystem/plugin discovery is not part of the contract.

## Complete public API

```ts
export declare function createRevoScripts(options: RevoScriptsOptions): RevoScripts;

export interface RevoScripts {
  resolveForPlan(script: {
    readonly id: `script:${string}`;
    readonly version: string;
  }): ScriptPlanDescriptor;
  execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>>;
  listManifests(): readonly ScriptManifestV1[];
  listProviderImplementations(): readonly ScriptProviderDescriptor[];
}
```

`RevoScriptsOptions`, `RevoScriptExecutionRequest`, `ScriptExecutionResult`, manifests, plans, and provider
descriptors are public typed contracts. Their exact fields and invariants live in the [runtime specification](docs/specs/script-runtime-v1.spec.md)
and the corresponding [source contracts](src/application/contracts/).

## Package and consumer boundary

```text
pipeline exact id/version + input + grants
                    |
                    v
createRevoScripts().execute(request)
  -> exact definition/provider validation
  -> host binding resolution
  -> bounded provider client
  -> one handler operation
  -> typed result or structured failure
```

The package does not own pipeline cursors, retries across pipeline nodes, human gates, workspace allocation, credential
policy, DBOS, Prisma, NestJS, or artifact persistence. Handlers receive only bounded typed provider clients and never
receive raw paths, tokens, process executors, generic HTTP clients, or mutable global logging.

## Documentation

- [Expanded consumer examples](docs/examples/consumer.md) — bindings, Git/GitHub operations, results, recovery,
  approval subjects, artifacts, and events.
- [Runtime v1 specification](docs/specs/script-runtime-v1.spec.md) — normative manifests, execution, errors, events,
  versions, providers, and results.
- [ADR-0001](docs/adr/0001-script-sdk-and-runtime-boundary.md) — package boundary and ownership decision.
- [Repository map](REPOSITORY.md) — source-of-truth order, layout, and dependency direction.
- [Testing contract](docs/testing.md) — TDD, proof layers, fixtures, and coverage ownership.
- [Per-script and provider cards](src/scripts/git/README.md) — operation-specific contracts and verification notes.

## Development

Requirements: Node.js `>=24.11.1 <25`, Corepack, and pnpm `11.13.0`.

```bash
corepack pnpm install
corepack pnpm verify
```

Useful commands:

```bash
pnpm build
pnpm test
pnpm test:cov
pnpm ci:local:sonar
```

The package is ESM/NodeNext with strict TypeScript, declarations, explicit exports, packed-consumer validation, and
SonarCloud analysis. Do not publish from a local machine; release and downstream compatibility require a separate
approval.
