<div align="center">

# @revisium/revo-scripts

**Bounded, versioned operations that a host can execute without knowing their implementation.**

[![CI](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> [!IMPORTANT]
> The package is unpublished. The low-level definition, registry, and one-script runtime exist for review. The
> `createRevoScripts` consumer facade and package-owned production providers described below are the Draft target and
> are not implemented yet.

## What this package owns

`@revisium/revo-scripts` is the independent home for bounded Revo operations. A built-in script owns its manifest,
schemas, handler, provider interaction, stale-state checks, error mapping, idempotency, and result. A consumer chooses
which exact script to run and supplies logical input, resource grants, and trusted host bindings; it does not implement
that script's Git or GitHub operation.

The target invariant is:

> Adding or upgrading a script within an installed provider family changes the package and pipeline data, not the
> orchestrator executor.

The package owns:

- versioned definitions, closed input/result schemas, typed results, and structured failures;
- explicit trusted registration and exact definition lookup;
- execution of one script with timeout, retry, idempotency, permission, event, redaction, and payload policy;
- package-owned bounded Git and GitHub operations and their provider adapters;
- reusable contract tests for built-in and trusted custom scripts.

The host owns:

- pipeline routing and durable workflow state;
- workspace allocation, retention, and release;
- credential storage and policy;
- logical resource and credential bindings for a run;
- event and artifact persistence;
- human gates and the decision about what happens after a script result.

The package resolves host bindings through stable host services. Script handlers never receive an absolute workspace
path, token, unrestricted process executor, generic network client, DBOS, Prisma, NestJS, or pipeline service.

## Internal ownership

The target source tree separates system mechanics, infrastructure, and concrete operations:

```text
src/
  core/                         spec, runtime, registry, host contracts, facade
  providers/
    git/contracts/              bounded Git protocol
    git/adapters/*/revisions/   immutable trusted implementations
    github/contracts/
    github/adapters/*/revisions/
  scripts/
    git/<operation>/versions/<semver>/
    github/<area>/<operation>/versions/<semver>/
  testing/                      core, provider, and script contract mechanics
```

A script imports its provider's bounded contract, never its adapter. A provider implements infrastructure and never
imports a concrete script. Only the facade composes host resolvers, exact registries, provider adapters, and script
modules. See [REPOSITORY.md](REPOSITORY.md) for the complete dependency graph and export-map rules.

## Mental model

```text
application startup
  createRevoScripts(host services, trusted definition modules, provider modules)
                              |
pipeline script node          |
  exact script ref            |
  domain input                |
  resource grants             |
             |                |
             +------ execute -+
                       |
                       v
              resolve exact definition
                       |
              resolve opaque host bindings
                       |
              construct permitted provider clients
                       |
              execute one bounded handler
                       |
              typed result + redacted events
```

`createRevoScripts` is startup composition. A pipeline node is runtime data. The host creates the facade once and uses
the same generic `execute` call for every script id.

## Consumer integration

The following API is the Draft target. Names and behavior are normative in the linked specification but are not yet
available from the current package build.

### 1. Compose the runtime once

```ts
import { builtInScripts, createRevoScripts } from '@revisium/revo-scripts';
import { nodeGitProviders } from '@revisium/revo-scripts/providers/git';
import { gitHubProviders } from '@revisium/revo-scripts/providers/github';

const scripts = createRevoScripts({
  definitions: [builtInScripts()],
  providers: [
    ...nodeGitProviders({ processExecutor }),
    ...gitHubProviders({ transport: githubTransport }),
  ],
  host: {
    workspaces: workspaceResolver,
    credentials: credentialResolver,
    events: eventSink,
    clock,
  },
});
```

This is the only provider-level composition point. `builtInScripts()` explicitly registers the package's trusted
definitions as one module; it is convenient for a host that installs every built-in provider. A narrower host uses
family modules such as `gitScripts()` or `githubScripts()` and does not need providers for unselected families. The
consumer never adds one `registry.register(...)` call per built-in.

Each provider-family factory returns one default for new plans plus any immutable revisions still retained for
recovery. Upgrading the package does not require the consumer to list implementation digests or wire old adapters. A
trusted host may explicitly select a retained internal revision as its new-plan default in factory configuration; that
revision id never enters pipeline data or an execution pin.

### 2. Declare a script node in pipeline data

```json
{
  "type": "script",
  "script": {
    "id": "script:git/diff-summary",
    "version": "1.0.0"
  },
  "input": {
    "base": "origin/master",
    "head": "HEAD"
  },
  "resources": {
    "repository": {
      "ref": "target",
      "access": "read"
    }
  }
}
```

The portable node contains no machine path, token, provider client, or executable source.

### 3. Compile exact execution facts

Generic plan compilation resolves the selected script definition and its required provider contracts. It chooses the
configured provider implementation for new plans and records exact immutable pins:

```ts
const executable = scripts.resolveForPlan({
  id: node.script.id,
  version: node.script.version,
});
```

The returned descriptor contains the exact definition digest, the manifest maximums, and provider pins such as
the provider slot and resource, `provider:git/node`, `revo.provider.git/v1`, the workspace requirement, the
implementation SHA-256, and its package provenance. The host does not write a per-script mapping or select a provider
in pipeline code.

The host also binds portable resource names to facts owned by that run:

```ts
const bindings = {
  resources: {
    repository: {
      resourceId: 'target',
      kind: 'repository',
      repositoryId: 'repository-123',
      workspaceId: 'workspace-456',
      access: 'read',
      grant: {
        permissions: ['git.diff-summary.read'],
        effects: ['git.read'],
      },
      providerCoordinates: {},
    },
  },
  credentials: {},
} as const;
```

For a GitHub operation, the same plan pins a credential alias rather than a secret:

```ts
const githubBindings = {
  resources: {
    repository: {
      resourceId: 'target',
      kind: 'repository',
      repositoryId: 'repository-123',
      access: 'publish',
      grant: {
        permissions: ['github.pull-request.upsert'],
        effects: ['github.read', 'github.write'],
      },
      providerCoordinates: {
        github: { owner: 'revisium', repository: 'orchestrator' },
      },
    },
  },
  credentials: {
    github: { alias: 'github-publication-account', provider: 'github' },
  },
} as const;
```

`workspaceId` is present only when the selected provider needs an allocated workspace. Workspace ids and credential
aliases are opaque, stable references. The pipeline never carries the resolved path or token.

The pipeline also never chooses a provider implementation. The compiler selects a compatible provider from trusted
startup composition, and the resulting plan pins it exactly. Recovery resolves the same pin; it never switches to a
new default or fallback.

### 4. Execute every script through one host path

```ts
const result = await scripts.execute({
  executionId: 'run-123:diff-summary:1',
  script: executable.script,
  providers: executable.providers,
  input: {
    base: 'origin/master',
    head: 'HEAD',
  },
  bindings,
  signal,
});

if (result.ok) {
  await persistOutput(result.value);
} else {
  await handleScriptFailure(result.error);
}
```

The executor does not branch on `script:git/diff-summary` or any other concrete id.

### 5. What happens inside the package

For a Git operation:

```text
workspaceId
  -> host workspace resolver
  -> trusted allocation with an absolute path
  -> package-owned Git provider
  -> bounded Git client captured in the handler context
  -> script handler
```

For a GitHub operation:

```text
credential alias
  -> host credential resolver
  -> short-lived resolved credential
  -> package-owned GitHub provider
  -> bounded GitHub client captured in the handler context
  -> script handler
```

Only trusted provider infrastructure sees a resolved path or credential. The handler calls bounded domain methods such
as `repository.git.status()` or `repository.github.readPullRequest(...)`; the path and credential remain private
closure state.

## Releasing a new script

Suppose package `1.2.0` adds `script:git/diff-summary@1.0.0` using capabilities already supplied by the Git provider.
Adoption requires:

1. update the package version;
2. reference the exact new script version in pipeline data;
3. compile its manifest maximums into the execution plan;
4. deploy a package build that contains the exact definition and provider implementations pinned by the plan.

It does not require a new orchestrator handler, capability interface, DBOS step, registry branch, or script-id switch.

## Versioning

Four identities remain separate:

| Identity                | Example                        | Purpose                                           |
| ----------------------- | ------------------------------ | ------------------------------------------------- |
| npm package             | `@revisium/revo-scripts@1.2.0` | Release vehicle containing many scripts/providers |
| script                  | `script:git/status@1.0.0`      | Immutable observable operation contract           |
| provider contract       | `revo.provider.git/v1`         | Bounded client protocol compatibility             |
| provider implementation | `provider:git/node` + SHA-256  | Exact adapter used by one compiled execution plan |

The pipeline specifies only an exact script id and SemVer. It never uses `latest`, a range, or a provider id. The
script manifest states which provider contract major it requires; generic plan compilation selects and pins a trusted
compatible implementation.

Multiple script versions can coexist during migration:

```text
src/scripts/git/status/versions/1.0.0/
src/scripts/git/status/versions/2.0.0/
```

An existing pipeline can continue to name `1.0.0` while a new pipeline names `2.0.0`. A published exact version is
immutable. It is removed only after no supported pipeline, execution plan, active execution, or recoverable run pins
it. Provider contract majors can coexist for the same reason. Provider adapters do not add another public SemVer in
v1; an exact implementation digest plus package provenance is persisted in the execution plan.

Provider adapter revisions coexist internally under paths such as
`src/providers/git/adapters/node/revisions/r1/`. The revision label is not another public SemVer or a pipeline field;
the execution plan still uses the generated digest. A new revision is added beside retained revisions, and an old one
is removed only after the same pin audit.

## Adding a new provider family

A new provider over the existing repository resource, such as GitLab, needs a trusted coordinate schema, transport,
and credential adapter:

```ts
const scripts = createRevoScripts({
  definitions: [builtInScripts(), gitLabScripts()],
  providers: [
    ...nodeGitProviders({ processExecutor }),
    ...gitHubProviders({ transport: githubTransport }),
    ...gitLabProviders({ transport: gitlabTransport }),
  ],
  host,
});
```

The generic pipeline executor still does not change. Installation, credential policy, and provider configuration do.
Provider modules prevent ordinary provider API growth from becoming orchestrator executor growth without granting
every script a generic shell or network client.

V1 resources are repositories. A provider such as Kubernetes introduces a cluster resource rather than another
repository provider. Supporting it requires a separately approved widening of the resource contract and possibly new
host lifecycle behavior, such as allocating or fencing a temporary environment. That is a legitimate host-level change,
not an ordinary script release. A future provider-defined resource-schema seam may reduce such changes, but this Draft
does not claim it exists.

## Custom scripts

Trusted custom scripts use the same definition and contract-test APIs as built-ins. They may consume existing bounded
provider clients without host changes. A custom provider module is required only for a new effect family. Definition
and provider modules are imported explicitly at startup; runtime filesystem scanning, package discovery, hot loading,
and implicit latest-version selection are forbidden.

## Current implementation status

| Surface                         | Current state           | Draft target                                                   |
| ------------------------------- | ----------------------- | -------------------------------------------------------------- |
| Manifest, schemas, definition   | Implemented             | Adds providers, verdict, credentials, and exact identity       |
| Sealed explicit registry        | Implemented             | Populated through trusted definition modules                   |
| Low-level `executeScript`       | Implemented             | Public low-level foundation beneath the consumer facade        |
| `script:git/status`             | Capability-backed proof | Package-owned Git provider and real temporary-repository proof |
| `createRevoScripts`             | Not implemented         | Sole high-level consumer integration                           |
| Git/GitHub production providers | Not implemented         | Package-owned trusted provider modules                         |
| npm publication                 | Not published           | Separate release approval                                      |

The current public `GitStatusCapability` is an exploratory proof, not the target consumer boundary. The target removes
per-operation capability implementation from consumers before publication.

### Current low-level API

Until the Draft facade lands, the implemented proof remains directly executable:

```ts
import { createScriptRegistry, executeScript } from '@revisium/revo-scripts';
import { gitStatusScript } from '@revisium/revo-scripts/git';
import { RecordingEventSink } from '@revisium/revo-scripts/testing';

const registry = createScriptRegistry();
const script = registry.register(gitStatusScript);
registry.seal();

const result = await executeScript(registry, script, {
  executionId: 'status-1',
  input: {},
  resources: {
    repository: {
      name: 'repository',
      kind: 'repository',
      access: 'read',
      grant: { permissions: ['git.status.read'], effects: ['git.read'] },
      capabilities: {
        readStatus: async () => ({
          branch: 'master',
          headSha: '0123456789abcdef0123456789abcdef01234567',
          detached: false,
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
          conflictedCount: 0,
        }),
      },
    },
  },
  eventSink: new RecordingEventSink(),
});
```

The target migration replaces the public `capabilities` field with package-prepared bounded `clients`. This is an
intentional pre-publication breaking change, not a compatibility alias.

## Package entrypoints

Currently implemented entrypoints:

| Entrypoint                       | Responsibility                                            |
| -------------------------------- | --------------------------------------------------------- |
| `@revisium/revo-scripts`         | Current curated runtime API; target consumer facade       |
| `@revisium/revo-scripts/spec`    | Definitions, manifests, schemas, results, and errors      |
| `@revisium/revo-scripts/runtime` | Low-level definition, registry, validation, and execution |
| `@revisium/revo-scripts/git`     | Current Git proof; target built-in Git definitions        |
| `@revisium/revo-scripts/testing` | Contract harness, fixtures, clocks, sinks, and fakes      |

Target provider factories live on `@revisium/revo-scripts/providers/git` and
`@revisium/revo-scripts/providers/github`; they are deliberately separate from concrete script exports. The host,
GitHub, and provider entrypoints remain absent until their first real implementation exists.

Provider contracts, adapters, and retained revisions remain inside this package and share its release cycle. They are
separate subpath exports, not separate npm packages.

## Architecture and contracts

- [Repository map](REPOSITORY.md) defines source-of-truth order, layout, ownership, and dependency direction.
- [ADR-0001](docs/adr/0001-script-sdk-and-runtime-boundary.md) records the package-owned operation and provider boundary.
- [Script runtime v1](docs/specs/script-runtime-v1.spec.md) defines the exact target facade, host bindings, providers,
  handler context, and execution contract.
- [Testing](docs/testing.md) defines TDD, test ownership, and per-script/provider proof.

Documents marked `Draft` describe the proposed target and do not make an API available. Current declarations and tests
remain authoritative for code that exists today.

## Schema strategy

The public `ScriptSchema` contract is validation-library-neutral. `createScriptSchema` accepts Standard Schema and
Standard JSON Schema compatible validators. Built-ins currently use Zod for type inference. `defineScript` compiles
the emitted Draft 2020-12 JSON Schema with Ajv in strict mode before registration.

## Development

Requirements:

- Node.js 24 (`>=24.11.1 <25`)
- pnpm 11.13.0 through Corepack
- Docker only for the local SonarCloud parity check

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

| Command                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `pnpm build`               | Build ESM JavaScript and TypeScript declarations with TypeScript 7 |
| `pnpm format`              | Format supported repository files with Oxfmt                       |
| `pnpm format:check`        | Verify formatting without writing files                            |
| `pnpm lint`                | Run type-aware Oxlint and TypeScript diagnostics                   |
| `pnpm test`                | Run focused Vitest unit, contract, and package suites              |
| `pnpm test:cov`            | Run tests and write LCOV coverage                                  |
| `pnpm verify:architecture` | Enforce the acyclic source dependency DAG with Oxlint              |
| `pnpm verify`              | Run the complete local CI gate                                     |
| `pnpm ci:local:sonar`      | Run verification, Sonar analysis, and open-issue inspection        |

## SonarCloud

Copy `.env.sonar.example` to an ignored local file and provide a Sonar token:

```bash
cp .env.sonar.example .env.sonar
pnpm ci:local:sonar
```

An existing environment file can be reused without copying secrets:

```bash
SONAR_ENV_FILE=/absolute/path/to/.env.sonar pnpm ci:local:sonar
```

CI runs the same verification gate before Sonar analysis. Pull requests additionally wait for the Quality Gate and
fail when open Sonar issues remain.

## Package contract

The package is ESM-only, uses explicit exports, emits declarations, and ships only `dist`, `README.md`, `LICENSE`, and
package metadata. Package contents and declarations are validated during `pnpm verify`.

## License

[MIT](LICENSE) © Revisium
