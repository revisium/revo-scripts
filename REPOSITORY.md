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
  runtime/
    spec/       portable manifests, schemas, definitions, results, and errors
    definition/ definition construction, schema adapters, and validation
    registry/   explicit exact-version registry
    execution/  provider-neutral events, redaction, retries, and one-script execution
    validation/ dependency-neutral validation primitives
    index.ts    curated public low-level entrypoint
  host/
    bindings/     immutable execution bindings
    credentials/  credential resolution port and resolved handle
    workspaces/   workspace resolution port and trusted allocation
    providers/    trusted provider module SPI
  application/
    contracts/    consumer facade contracts
    registration/ definition module composition
    providers/    provider catalog and execution preparation
    execution/    generic one-script coordination
  providers/
    git/
      contracts/      handler-safe Git client contracts
      adapters/node/  process-backed implementation and bounded clients
  scripts/
    git/status/       built-in Git status proof
  testing/
    runtime/       public runtime contract mechanics and deterministic clocks/sinks
    providers/git/ public bounded Git provider fakes

test/
  unit/          focused pure and adapter behavior
  contract/      runtime and per-script observable contracts
  integration/
    consumer/    public facade flows with injected host/provider boundaries
    providers/   production adapters against controlled system fixtures
  package/       source entrypoint and package metadata contracts
  support/       private deterministic test mechanics

docs/
  adr/        architectural decisions
  specs/      exact normative contracts
```

Directories and public entrypoints are created only with their first real owner. Do not add empty placeholder modules
or broad barrels to make the target tree appear complete. GitHub areas are therefore deferred until their first
bounded script or provider contract is implemented.

## Growth layout

The Draft target adds areas only with their first implementation:

```text
src/
  runtime/
    spec/       portable script contracts
    definition/ definition construction and validation
    registry/   explicit exact-version definition registry
    execution/  provider-neutral low-level execution
    validation/ dependency-neutral validation primitives
    index.ts    curated public low-level entrypoint
  host/
    bindings/     immutable execution bindings
    credentials/  credential integration contracts
    workspaces/   workspace integration contracts
    providers/    trusted provider module SPI
  application/
    contracts/    createRevoScripts facade contracts
    registration/ definition module composition
    providers/    provider catalog and execution preparation
    execution/    generic execute path

  providers/
    git/
      contracts/
        bounded Git client protocol
      adapters/
        node/
          status/ bounded status client and Git protocol parser
    github/
      contracts/
        bounded GitHub client protocol
      adapters/
        api/    bounded GitHub API implementation

  scripts/
    git/
      status/
      diff-summary/
    github/
      pull-request/
        readiness/
        upsert/
      review-threads/
        respond/
        resolve/

  testing/
    runtime/    runtime and registry contract mechanics
    providers/  provider contract suites and fakes
    scripts/    script contract suites and fixtures
```

`runtime`, `host`, `application`, `providers`, `scripts`, and `testing` are the top-level ownership areas. Runtime
contains provider-neutral contracts and one-script mechanics; its `index.ts` is only the curated low-level public
entrypoint. Host owns privileged ports, while application owns the consumer facade and is the composition root. A
provider contract or adapter MUST NOT be placed in the same directory as a concrete script. A script category groups
bounded operations by domain; it does not own the provider implementation. A `providers/shared/` area MAY be created
only when two real provider families share one stable abstraction. It MUST NOT become a generic utilities directory.

Categories and intermediate directories are created only with their first owner; the tree above is a map, not a
request for empty placeholders. Each operation currently has one flat implementation directory that separates its
contract and implementation:

```text
<operation>/
  README.md
  types.ts
  schemas.ts
  manifest.ts
  <operation>.handler.ts
  script.ts
```

`script.ts` is the version composition root only. The handler is a stateless class with one `execute` method. Types,
schemas, manifest policy, and provider mechanics MUST NOT be mixed into the composition file.

Script SemVer and provider implementation identity remain contract data, not folder naming. The package currently
ships one implementation per operation/provider id. A physical retention scheme for multiple implementations is
deferred until a real coexistence requirement is designed and accepted; do not introduce `versions/` or `revisions/`
folders speculatively.

Every built-in operation and concrete provider adapter keeps a README card based on `docs/authoring/`. A file owns one
concrete class. Public reusable contracts and unrelated policies stay in separate files; small cohesive pure helpers
may remain together.

## Dependency direction

```text
runtime/spec <- runtime/definition
runtime/spec <- runtime/registry
runtime/spec + runtime/registry + runtime/validation <- runtime/execution
runtime/definition + runtime/registry + runtime/execution <- runtime/index
runtime/spec <- host
runtime/spec <- providers/*/contracts
runtime/spec + host + providers/*/contracts <- providers/*/adapters
runtime/spec + runtime/definition + providers/*/contracts <- scripts/*
runtime + host + providers/*/adapters + scripts/* <- application
runtime + host + application + providers + scripts <- testing
```

- `runtime/spec` and `runtime/validation` are dependency leaves; spec owns contracts and validation owns only neutral
  primitives.
- Runtime definition, registry, and execution have separate reasons to change. The public `runtime/index.ts` entrypoint
  curates them without becoming a new implementation owner.
- Execution is provider-neutral and does not import definition construction, built-in Git, or GitHub definitions.
- `host` owns privileged integration types but no host implementation or resource lifecycle.
- Only `application` composes host resolvers, exact registries, provider adapters, and definition modules.
- Git and GitHub do not import one another.
- Production source never imports `testing`, test support, build output, or repository scripts.
- Tests import explicit modules; there is no broad test-support barrel.
- Public consumers use the export map and never deep-import internal files.

`.oxlintrc.architecture.json` enforces this graph, curated consumer test imports, and zero value or type dependency
cycles through Oxlint's module graph. Architecture-rule changes require a temporary negative probe proving that the
intended override rejects a representative forbidden import. Published boundaries are enforced independently through
explicit exports, declarations, packed-consumer execution, `publint`, Are The Types Wrong, and pack-content
validation.

The full Draft target preserves the same direction as more provider families and scripts are added:

```text
runtime/spec <- runtime/definition
runtime/spec <- runtime/registry
runtime/spec + runtime/registry + runtime/validation <- runtime/execution
runtime/definition + runtime/registry + runtime/execution <- runtime/index
runtime/spec <- host
runtime/spec <- providers/*/contracts
runtime/spec + host + providers/*/contracts <- providers/*/adapters
runtime/spec + runtime/definition + providers/*/contracts <- scripts/*
runtime + host + providers/*/adapters + scripts/* <- application
runtime + application + providers + scripts <- testing
```

Scripts may depend only on `runtime/spec`, runtime definition construction, and handler-safe bounded provider contracts in their own
category. They MUST NOT import the execution implementation, provider adapters, privileged host contracts, another
provider family, or application composition. Providers MUST NOT import concrete scripts. Provider adapters construct
bounded clients but MUST NOT decide script result schemas, stale-state policy, idempotency, or business outcomes. The
application layer is the composition root and the only production area allowed to join host resolvers, provider adapters,
registries, and script modules.

Provider contract directories MUST NOT import `host` or export adapter construction types. The trusted provider module
SPI belongs to `host`; an adapter implements it while importing its family's handler-safe contract.

Architecture enforcement MUST distinguish provider contracts from adapters and concrete scripts before the first
target provider lands. Runtime remains provider-neutral and no dependency cycle is permitted.

## Ownership boundaries

The package owns script definition, one-script execution, each built-in operation, and the production provider adapters
used by built-in Git and GitHub scripts. It does not own pipeline routing, durable workflow state, workspace lifecycle,
credential storage or account-selection policy, human gates, artifact persistence, DBOS, Prisma, or NestJS.

Provider contracts and adapters are released from this repository through explicit package subpaths. They are not
separate npm packages and do not have independent release cycles.

The host exposes stable privileged resolvers for opaque workspace ids and credential aliases. Package-owned providers
may use resolved paths, credentials, process execution, or transports internally. Provider clients returned to
handlers are bounded domain ports and hide those values in private instance state. Raw process execution, workspace
paths, environment maps, tokens, generic HTTP or GraphQL clients, and global mutable loggers are never handler
capabilities.

Stateful runtime components use classes with TypeScript `private` members; ECMAScript `#private` fields are not used.
Manifests, plans, pins, results, failures, and events are TypeScript `readonly` transport values. Construction
snapshots retained input collections, but production code does not use `Object.freeze`; persisted or externally
restored values are validated at their owning boundary.

Adding a script within an installed provider family must not require a host executor change. Adding a provider family
requires an explicit trusted provider module and configuration. Host-layer code changes only when the provider needs a
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

Provider factories are not re-exported from the Git or GitHub script entrypoints. Consumers choose a script through
its exact manifest identity rather than a deep import or a filesystem path.

## Change routing

- Public API or architecture changes require an approved Draft or Accepted ADR/spec before implementation. Draft
  contracts must be accepted before their behavior is described as shipped.
- Behavior changes start with a failing test in the owning layer.
- Built-in operation changes update their contract documentation and tests together.
- Verification follows `VERIFICATION.md`; review follows `REVIEW.md`.
- Publishing, release creation, and consumer cutover require separate approval.
