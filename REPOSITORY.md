# Repository Map

This repository contains the independent `@revisium/revo-scripts` npm package. It owns the public SDK and runtime for
one bounded script, reusable contract testing, and independently versioned built-in scripts.

## Source of truth

For currently shipped behavior, use this order:

1. `package.json` exports and package metadata;
2. emitted declarations and the source files that produce them;
3. executable tests and package validation;
4. README examples.

For target behavior that is not shipped yet, use this order:

1. an Accepted specification for exact normative behavior;
2. its linked Accepted ADR for the decision and trade-offs;
3. an approved implementation issue or route for delivery scope.

A Draft ADR or specification is a proposal. It does not override current package behavior or make an API available.
An approved Draft governs only its explicitly approved implementation slice. It must become Accepted before the target
behavior is described as shipped.
When code and an Accepted spec disagree, stop and resolve the contract rather than silently treating either as a
compatibility fallback.

README consumer examples marked as Draft explain the proposed integration model. The linked ADR owns the decision and
the specification owns exact target behavior. Current declarations and tests remain authoritative until that target is
implemented and accepted.

## Current layout

```text
src/
  core/
    spec/       portable manifests, schemas, definitions, results, and errors
    runtime/    provider-neutral validation, events, redaction, and execution
    registry/   explicit exact-version registry
  host/         privileged host bindings and provider module SPI
  facade/       startup composition, plan resolution, and generic execution
  providers/
    git/
      contracts/v1/  handler-safe Git client contracts
      adapters/node/revisions/r1/  immutable process-backed implementation
  scripts/
    git/status/versions/1.0.0/  built-in Git status proof
  testing/
    core/       public contract-test mechanics and deterministic fakes

test/
  unit/          focused pure and adapter behavior
  contract/      runtime and per-script observable contracts
  package-smoke.test.ts  source entrypoint and package metadata contract
  support/       private deterministic test mechanics

docs/
  adr/        architectural decisions
  specs/      exact normative contracts
```

Directories and public entrypoints are created only with their first real owner. Do not add empty placeholder modules
or broad barrels to make the target tree appear complete. GitHub areas are therefore deferred until their first
bounded script or provider contract is implemented.

## Target layout

The Draft target adds areas only with their first implementation:

```text
src/
  core/
    spec/       portable script contracts
    runtime/    provider-neutral low-level execution
    registry/   explicit exact-version definition and provider registries
  host/         privileged host/provider integration contracts
  facade/       createRevoScripts composition and generic execute path

  providers/
    git/
      contracts/
        v1/     bounded Git client protocol
      adapters/
        node/
          revisions/
            r1/ immutable process-backed implementation revision
    github/
      contracts/
        v1/     bounded GitHub client protocol
      adapters/
        api/
          revisions/
            r1/ immutable GitHub API implementation revision

  scripts/
    git/
      status/
        versions/
          1.0.0/
      diff-summary/
        versions/
          1.0.0/
    github/
      pull-request/
        readiness/
          versions/
            1.0.0/
        upsert/
          versions/
            1.0.0/
      review-threads/
        respond/
          versions/
            1.0.0/
        resolve/
          versions/
            1.0.0/

  testing/
    core/       runtime and registry contract mechanics
    providers/  provider contract suites and fakes
    scripts/    script contract suites and fixtures
```

`core`, `providers`, and `scripts` are separate ownership areas. A provider contract or adapter MUST NOT be placed in
the same directory as a concrete script. A script category groups bounded operations by domain; it does not own the
provider implementation. A `providers/shared/` area MAY be created only when two real provider families share one
stable abstraction. It MUST NOT become a generic utilities directory.

Each exact published script version has its own immutable implementation directory. Categories and intermediate
directories are created only with their first owner; the tree above is a map, not a request for empty placeholders.
Provider adapter revisions are also immutable. Their internal revision names are storage identities, not public
compatibility versions; execution still pins the generated digest. A new adapter implementation adds a revision beside
retained revisions. Removing one requires the same live-pin audit as removing a script version.

## Dependency direction

```text
core/spec <- core/registry <- core/runtime
core/spec <- host
core/spec <- providers/*/contracts
core/spec + host + providers/*/contracts <- providers/*/adapters
core/spec + core/runtime + providers/*/contracts <- scripts/*
core/runtime + core/registry + host + providers/*/adapters + scripts/* <- facade
core + host + facade + providers + scripts <- testing
```

- `core/spec` is the dependency leaf.
- Runtime is provider-neutral and does not import built-in Git or GitHub definitions.
- `host` owns privileged integration types but no host implementation or resource lifecycle.
- Only `facade` composes host resolvers, exact registries, provider adapters, and definition modules.
- Git and GitHub do not import one another.
- Production source never imports `testing`, test support, build output, or repository scripts.
- Tests import explicit modules; there is no broad test-support barrel.
- Public consumers use the export map and never deep-import internal files.

`.oxlintrc.architecture.json` enforces this graph and zero value or type dependency cycles through Oxlint's module
graph. Published boundaries are enforced independently through explicit exports, declarations, package smoke tests,
`publint`, Are The Types Wrong, and pack-content validation.

The full Draft target preserves the same direction as more provider families and scripts are added:

```text
core/spec <- core/registry <- core/runtime
core/spec <- host
core/spec <- providers/*/contracts
core/spec + host + providers/*/contracts <- providers/*/adapters
core/spec + core/runtime + providers/*/contracts <- scripts/*
core/runtime + core/registry + host + providers/*/adapters + scripts/* <- facade
core + providers + scripts <- testing
```

Scripts may depend only on `core/spec`, the provider-neutral execution surface, and handler-safe bounded provider
contracts in their own category. They MUST NOT import provider adapters, privileged host contracts, another provider
family, or facade composition. Providers MUST NOT import concrete scripts. Provider adapters construct bounded clients
but MUST NOT decide script result schemas, stale-state policy, idempotency, or business outcomes. The facade is the
composition root and the only production area allowed to join host resolvers, provider adapters, registries, and script
modules.

Provider contract directories MUST NOT import `host` or export adapter construction types. The trusted provider module
SPI belongs to `host`; an adapter implements it while importing its family's handler-safe contract.

Architecture enforcement MUST distinguish provider contracts from adapters and concrete scripts before the first
target provider lands. Runtime remains provider-neutral and no dependency cycle is permitted.

## Ownership boundaries

The package owns script definition, one-script execution, each built-in operation, and the production provider adapters
used by built-in Git and GitHub scripts. It does not own pipeline routing, durable workflow state, workspace lifecycle,
credential storage or account-selection policy, human gates, artifact persistence, DBOS, Prisma, or NestJS.

Provider contracts, adapters, and retained revisions are released from this repository through explicit package
subpaths. They are not separate npm packages and do not have independent release cycles.

The host exposes stable privileged resolvers for opaque workspace ids and credential aliases. Package-owned providers
may use resolved paths, credentials, process execution, or transports internally. Provider clients returned to
handlers are bounded domain ports and hide those values in private closure state. Raw process execution, workspace
paths, environment maps, tokens, generic HTTP or GraphQL clients, and global mutable loggers are never handler
capabilities.

Adding a script within an installed provider family must not require a host executor change. Adding a provider family
requires an explicit trusted provider module and configuration. Host-core code changes only when the provider needs a
new resource lifecycle that the stable host integration contract cannot represent.

## Package surface

The root entrypoint exposes the high-level `createRevoScripts` facade, built-in definition-module factories, and the
four low-level SDK/runtime functions: `defineScript`, `createScriptSchema`, `createScriptRegistry`, and
`executeScript`. Provider factories, faults, individual built-ins, privileged host contracts, and testing mechanics
remain on explicit domain subpaths. Adding a source file does not make it public; `package.json` is authoritative for
shipped exports.

Testing utilities are public only through `@revisium/revo-scripts/testing`. Private fixtures and repository validation
scripts are never shipped as package API.

The target export map keeps physical ownership and consumer intent distinct:

| Entrypoint                                | Public responsibility                                                |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `@revisium/revo-scripts`                  | Curated facade and startup module factories                          |
| `@revisium/revo-scripts/spec`             | Portable manifests, schemas, results, and failures                   |
| `@revisium/revo-scripts/runtime`          | Low-level definition, registry, validation, and one-script execution |
| `@revisium/revo-scripts/host`             | Privileged host integration contracts                                |
| `@revisium/revo-scripts/git`              | Git script definitions and domain result types                       |
| `@revisium/revo-scripts/github`           | GitHub script definitions and domain result types                    |
| `@revisium/revo-scripts/providers/git`    | Git contract and trusted provider-family factory                     |
| `@revisium/revo-scripts/providers/github` | GitHub contract and trusted provider-family factory                  |
| `@revisium/revo-scripts/testing`          | Contract suites, deterministic fakes, clocks, and recording sinks    |

Provider factories are not re-exported from the Git or GitHub script entrypoints. Internal version directories remain
behind the export map; consumers choose a script through its exact manifest identity rather than a deep import.

## Change routing

- Public API or architecture changes require an approved Draft or Accepted ADR/spec before implementation. Draft
  contracts must be accepted before their behavior is described as shipped.
- Behavior changes start with a failing test in the owning layer.
- Built-in operation changes update their contract documentation and tests together.
- Verification follows `VERIFICATION.md`; review follows `REVIEW.md`.
- Publishing, release creation, and consumer cutover require separate approval.
