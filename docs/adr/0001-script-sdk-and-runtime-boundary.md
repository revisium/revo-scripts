# ADR-0001 - Script SDK and runtime boundary

- **Status:** Accepted
- **Proposed:** 2026-07-14
- **Spec:** [Script runtime v1](../specs/script-runtime-v1.spec.md)

## Context

Revo needs operations with independent revisions for Git, GitHub, and future bounded effects. Keeping their definitions
inside a host application couples operation releases to orchestration releases and gives external authors no stable
way to implement compatible scripts. A catalog alone would still leave every host to invent validation, registration,
execution, errors, events, and test conventions.

The package must remain usable without adopting Revo orchestration. It must also prevent extension from becoming
runtime discovery of untrusted code or an unrestricted utility surface.

## Decision

`@revisium/revo-scripts` will be the public SDK and runtime for one bounded script. It will own script contracts,
definition and validation, explicit registry mechanics, single-script execution policy, reusable contract testing,
independently exported bounded built-in scripts, and the trusted provider implementations used by those built-ins.

The primary consumer API will be a `createRevoScripts` facade composed once at host startup from stable host services,
explicit trusted definition modules, and explicit provider modules. The host will use one generic execution call for
every script. Generic host code will not compare concrete script identifiers, construct per-operation capabilities, or
implement a built-in's Git or GitHub behavior.

That call accepts only execution identity, an exact script id with a positive integer revision, input, bindings, and an
optional abort signal and idempotency key. The package resolves the definition and the one registered implementation
for each manifest provider contract internally. Consumers do not compile a script plan, supply a definition digest, or
select provider implementations.

Built-in scripts will own the complete bounded operation: provider calls, normalization, stale-state fences,
idempotency and crash reconciliation, provider-error mapping, and typed result. Package-owned provider modules will
resolve opaque host bindings into private bounded clients. The host will provide only infrastructure it necessarily
owns: workspace resolution, credential resolution, event persistence, time, and policy grants. Artifact persistence
remains a host action over validated script results and evidence references.

Script results are domain payloads only. They do not contain run, node, attempt, workspace, execution-plan, artifact,
or provenance fields. A host may wrap a validated result in its single `ArtifactEnvelope` using schema identity from
the resolved definition and `OutputProvenance` from durable execution context. This wrapping is generic and never branches
on script id.

Resolved workspace paths and credentials may exist inside trusted provider infrastructure, but they will never be
members of handler input or `ScriptContext`. Handlers will receive bounded resource clients whose private closure state
contains the resolved values. A handler will not receive a shell, raw process executor, unrestricted filesystem root,
generic network client, token resolver, DBOS, Prisma, NestJS, or orchestration service.

The runtime accepts explicitly imported trusted definition modules, but a stable external custom-script SDK and its
distribution and trust policy are deferred. This ADR does not promise automatic discovery or arbitrary third-party
code loading. The package will not scan directories, download code, or choose untrusted modules on the host's behalf.
Package-provided family definition modules avoid per-script registration wiring without forcing a Git-only host to
install GitHub infrastructure. An all-built-ins module remains a convenience for hosts that select every family.

The source tree will separate provider-neutral contracts, definition construction, registration, and execution under
`src/runtime`; privileged integration ports under `src/host`; consumer use cases and facade composition under
`src/application`; trusted provider contracts and adapters under `src/providers/<family>`; and concrete operations
under `src/scripts/<category>/<operation>`. `src/runtime/index.ts` is only the curated low-level public entrypoint. A
concrete script may depend on definition construction and a bounded provider contract but never on execution internals,
an adapter implementation, a privileged host resolver, or application composition. Providers never import scripts.
The application layer behind the public facade is the composition root that joins these areas.

Script revisions remain exact manifest identities rather than directory names. A revision is a positive safe integer,
and a published `(script id, revision)` is immutable. The repository currently retains one implementation per script
revision and one implementation per provider contract. A multi-revision source-retention scheme requires a separate
proven design and must not be introduced speculatively.

Package, script, provider-contract, and provider-implementation identity are deliberately separate:

- the npm package follows ordinary package SemVer and may contain many script identities and revisions;
- a pipeline names one immutable exact positive integer script revision; simultaneous source retention is deferred;
- a script manifest names the provider protocol major it requires, such as `revo.provider.git/v1`;
- package startup registers exactly one implementation for each provider contract required by selected definitions.

Provider implementations do not receive a second public SemVer in v1. Their exact digest and package provenance are
sufficient for build provenance, while the contract major expresses compatibility. Execution selects the sole
registered implementation by manifest contract. Startup rejects duplicate implementations for one contract, and
execution never chooses `latest`, uses a range, parses script SemVer, or falls back to another implementation.

V1 keeps one built-in implementation per provider contract. A provider-family factory registers that implementation;
registering another implementation for the same contract is invalid. Provider contracts and adapters remain subpaths of
`@revisium/revo-scripts`; separate provider npm packages are outside this architecture.

Orchestration, durable workflow state, workspace lifecycle, credentials, human gates, and artifact persistence remain
outside the package. The host supplies logical resource and credential aliases from its immutable execution plan; the
package performs the selected operation and returns domain data or a structured failure. The exact facade, host,
provider, binding, and handler boundaries are defined in the linked specification.

Provider modules choose an operation-specific bounded client from manifest permissions and resource access. They do
not compare concrete script ids. Consequently a status handler cannot receive commit/push methods, and a read-only
GitHub handler cannot receive mutation methods, while the host remains generic.

## Relationship to orchestrator milestone 11

This ADR extracts and generalizes the bounded-operation design documented by orchestrator
[ADR-0011](https://github.com/revisium/orchestrator/blob/master/docs/adr/0011-system-script-runtime-and-trusted-extensions.md),
[script runtime v1](https://github.com/revisium/orchestrator/blob/master/docs/specs/script-runtime-v1.spec.md), and
[resources, workspaces, and effects v1](https://github.com/revisium/orchestrator/blob/master/docs/specs/resources-workspaces-effects-v1.spec.md).
It does not silently replace those documents. Package acceptance establishes the reusable contract; orchestrator
adoption requires one direct cutover update to consume it and delete the duplicated internal contract without an alias
or compatibility adapter.

| Concern             | Preserved decision                                                                                   | Package refinement                                                                                                                     | Required orchestrator adoption action                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Operation boundary  | One bounded handler; no routing, gates, workspace lifecycle, raw path, token, shell, DBOS, or Prisma | No change                                                                                                                              | Consume package handlers through the generic facade                                                        |
| Public SDK          | Milestone 11 deferred a public SDK until the internal model was proven                               | This repository is the separately reviewed SDK and provider implementation                                                             | Amend ADR-0011's phase scope before cutover                                                                |
| Manifest identity   | Closed versioned manifest and exact definition identity                                              | `revo.script.manifest/v1` uses one exact positive integer revision; named resources and credential slots generalize the internal shape | Replace the internal schema directly; do not translate between schemas                                     |
| Verdict routing     | Optional schema-validated JSON Pointer                                                               | Deferred from package v1; domain results remain provider-neutral payloads                                                              | Keep pipeline branching and fragment semantics in orchestrator                                             |
| Executable identity | Definition digest includes a trusted generated build digest                                          | The package resolves it internally from the exact script id and revision; unrelated additions do not change it                         | Persist package results without adding a consumer-supplied definition digest                               |
| Errors and events   | Typed failures and lifecycle/progress events                                                         | Lowercase `revo.script.*` codes and `revo.script.*` lifecycle names are the package vocabulary                                         | Update the orchestrator contract and persisted event mapping atomically                                    |
| Credentials         | Host-selected Git/GitHub aliases, never secrets                                                      | Named provider-neutral slots bind to aliases; provider modules resolve only declared slots                                             | Compile existing aliases into package bindings                                                             |
| Git status effects  | Internal milestone listed `filesystem.read` plus `git.read`                                          | Package manifests declare handler-visible effect surfaces; filesystem access hidden inside the Git provider is covered by `git.read`   | Amend the duplicated internal inventory; reserve `filesystem.read` for a handler-visible filesystem client |

The source orchestrator documents remain marked `Draft` in their file headers even though issue
[#342](https://github.com/revisium/orchestrator/issues/342) records their decision package as accepted. Until status is
reconciled in orchestrator, this repository treats them as design sources rather than claiming an already-effective
cross-repository supersession.

## Alternatives Considered

- **Ship only a built-in script catalog.** Rejected because custom authors and hosts would duplicate the runtime and
  validation contract.
- **Ship only an SDK and keep built-ins in the host.** Rejected because bounded operations need their own release and
  verification cycle, independent from a consuming host.
- **Keep scripts internal to the orchestrator.** Rejected because it preserves release coupling and prevents reuse by
  other trusted hosts.
- **Require the host to implement one capability per operation.** Rejected because adding a script would continue to
  require orchestrator code changes and would leave most operation behavior outside the package.
- **Give handlers raw paths, tokens, shell, or generic network access.** Rejected because apparent autonomy would bypass
  resource grants, leak host-owned secrets and lifecycle state, and make effect auditing impractical.
- **Keep provider implementations in each consumer.** Rejected for built-ins because it would duplicate behavior and
  prevent the package from proving an operation end to end. Hosts may still replace a provider through an explicit
  trusted provider module when required by their platform.
- **Publish provider implementations as separate npm packages.** Rejected because it would introduce a package
  compatibility matrix, coordinated releases, and distributed retention before the package has proved its built-in Git
  and GitHub contracts. Provider families remain explicit subpath exports of this package.
- **Mix provider code and concrete scripts in one domain directory.** Rejected because infrastructure construction and
  business operation ownership have different dependencies, tests, security boundaries, and change reasons.
- **Use only the npm package version for script identity.** Rejected because one package release contains many
  independently migrating operations and recoverable runs must resolve one exact observable contract.
- **Give provider implementations their own public SemVer in v1.** Rejected because it adds a fourth user-selected
  compatibility axis without improving deterministic recovery; the protocol major plus exact implementation digest
  already separates compatibility from identity.
- **Support automatic plugin discovery.** Rejected because installation and trust policy belong to the host, and
  implicit loading weakens startup auditability.

## Consequences

- Built-ins share one versioned contract and test kit; a stable external custom-script distribution contract remains
  deferred.
- A published `(script id, revision)` is immutable. Any observable change requires a larger revision, and removal
  requires evidence that no supported pipeline or recoverable run references it. Simultaneous source retention
  requires a later accepted design.
- Consumers can adopt the package without DBOS, Prisma, NestJS, or a Revo pipeline.
- The package accepts a public API and immutable-revision burden earlier than a private runtime would. The npm package
  keeps its separate SemVer release contract.
- A new script inside an installed provider family changes package code and pipeline data, not the host executor.
- A new provider family requires an explicit trusted provider module, credential/resource policy, and configuration;
  it does not require a concrete-id branch in the host executor.
- A host-layer change is justified only when a provider needs a resource lifecycle the stable host contract cannot
  express, not merely because the provider adds another operation.
- The package must maintain production provider adapters, normalize their failure modes, and prove them with real local
  or provider-contract fixtures.
- Hosts must implement the stable infrastructure services and explicitly manage which definition/provider modules are
  trusted.
- Provider adapter changes that preserve all observable script behavior do not force a script revision change. An
  observable behavior change still requires a larger script revision.
- Provider contracts, adapters, verification, and releases remain owned by this package and its release cycle.
