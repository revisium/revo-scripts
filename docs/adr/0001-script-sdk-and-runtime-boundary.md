# ADR-0001 - Script SDK and runtime boundary

- **Status:** Draft
- **Proposed:** 2026-07-14
- **Spec:** [Script runtime v1](../specs/script-runtime-v1.spec.md)

## Context

Revo needs independently versioned operations for Git, GitHub, and future bounded effects. Keeping their definitions
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

Built-in scripts will own the complete bounded operation: provider calls, normalization, stale-state fences,
idempotency and crash reconciliation, provider-error mapping, and typed result. Package-owned provider modules will
resolve opaque host bindings into private bounded clients. The host will provide only infrastructure it necessarily
owns: workspace resolution, credential resolution, event persistence, time, and policy grants. Artifact persistence
remains a host action over validated script results and evidence references.

Resolved workspace paths and credentials may exist inside trusted provider infrastructure, but they will never be
members of handler input or `ScriptContext`. Handlers will receive bounded resource clients whose private closure state
contains the resolved values. A handler will not receive a shell, raw process executor, unrestricted filesystem root,
generic network client, token resolver, DBOS, Prisma, NestJS, or orchestration service.

Custom scripts will use the same contracts as built-ins. A host will explicitly install trusted definition and
provider modules before execution. The package will not scan directories, download code, or choose untrusted modules on
the host's behalf. Package-provided family definition modules will avoid per-script registration wiring without
forcing a Git-only host to install GitHub infrastructure. An all-built-ins module remains a convenience for hosts that
select every family.

The source tree will separate three ownership areas: provider-neutral system code under `src/core`, trusted provider
contracts and adapters under `src/providers/<family>`, and concrete versioned operations under
`src/scripts/<category>/<operation>/versions/<semver>`. A concrete script may depend on a bounded provider contract but
never on an adapter implementation or privileged host resolver. Providers never import scripts. The facade is the
composition root that joins these areas.

Package, script, provider-contract, and provider-implementation identity are deliberately separate:

- the npm package follows ordinary package SemVer and may contain many script identities and versions;
- a pipeline names one immutable exact script SemVer, and multiple versions of one script may coexist;
- a script manifest names the provider protocol major it requires, such as `revo.provider.git/v1`;
- an execution plan pins the selected provider implementation by stable id, contract major, workspace mode, package
  provenance, and implementation digest.

Provider implementations do not receive a second public SemVer in v1. Their exact digest and package provenance are
sufficient for deterministic execution and recovery, while the contract major expresses compatibility. Plan
compilation selects one configured compatible provider for a new run and records the exact pin. Execution and recovery
never choose `latest`, use a range, or fall back to another implementation.

V1 retains built-in provider implementations as immutable in-package adapter revisions. A provider-family factory
registers the current new-plan default and every retained revision, while plans continue to pin only the exact digest
and provenance. A revision is removed only after an external audit proves that no supported or recoverable plan pins
it. Provider contracts, adapters, and retained revisions remain subpaths of `@revisium/revo-scripts`; separate provider
npm packages are outside this architecture.

Orchestration, durable workflow state, workspace lifecycle, credentials, human gates, and artifact persistence remain
outside the package. The host supplies logical resource and credential aliases from its immutable execution plan; the
package performs the selected operation and returns domain data or a structured failure. The exact facade, host,
provider, binding, and handler boundaries are defined in the linked specification.

## Relationship to orchestrator milestone 11

This ADR extracts and generalizes the bounded-operation design documented by orchestrator
[ADR-0011](https://github.com/revisium/orchestrator/blob/master/docs/adr/0011-system-script-runtime-and-trusted-extensions.md),
[script runtime v1](https://github.com/revisium/orchestrator/blob/master/docs/specs/script-runtime-v1.spec.md), and
[resources, workspaces, and effects v1](https://github.com/revisium/orchestrator/blob/master/docs/specs/resources-workspaces-effects-v1.spec.md).
It does not silently replace those documents. Package acceptance establishes the reusable contract; orchestrator
adoption requires one direct cutover update to consume it and delete the duplicated internal contract without an alias
or compatibility adapter.

| Concern             | Preserved decision                                                                                   | Package refinement                                                                                                                   | Required orchestrator adoption action                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Operation boundary  | One bounded handler; no routing, gates, workspace lifecycle, raw path, token, shell, DBOS, or Prisma | No change                                                                                                                            | Consume package handlers through the generic facade                                                        |
| Public SDK          | Milestone 11 deferred a public SDK until the internal model was proven                               | This repository is the separately reviewed SDK and provider implementation                                                           | Amend ADR-0011's phase scope before cutover                                                                |
| Manifest identity   | Closed versioned manifest and exact definition pin                                                   | `revo.script.manifest/v1` becomes the sole package schema; named resources and credential slots generalize the internal shape        | Replace the internal schema directly; do not translate between schemas                                     |
| Verdict routing     | Optional schema-validated JSON Pointer                                                               | Retained as `manifest.verdict`; the facade returns the extracted enum generically                                                    | Consume the returned verdict without script-id branches                                                    |
| Executable identity | Definition digest includes a trusted generated build digest                                          | Refined to the exact definition runtime closure so unrelated additions do not invalidate existing pins                               | Pin exact definition digest and provider provenance; audit availability before recovery                    |
| Errors and events   | Typed failures and lifecycle/progress events                                                         | Lowercase `revo.script.*` codes and `revo.script.*` lifecycle names are the package vocabulary                                       | Update the orchestrator contract and persisted event mapping atomically                                    |
| Credentials         | Plan-pinned Git/GitHub aliases, never secrets                                                        | Named provider-neutral slots bind to aliases; provider modules resolve only declared slots                                           | Compile existing aliases into package bindings                                                             |
| Git status effects  | Internal milestone listed `filesystem.read` plus `git.read`                                          | Package manifests declare handler-visible effect surfaces; filesystem access hidden inside the Git provider is covered by `git.read` | Amend the duplicated internal inventory; reserve `filesystem.read` for a handler-visible filesystem client |

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

- Built-ins and custom scripts share one versioned contract and test kit.
- Multiple exact versions of one script may coexist during migration and recovery. A published version is immutable and
  can be removed only after no supported pipeline, execution plan, or recoverable run pins it.
- Consumers can adopt the package without DBOS, Prisma, NestJS, or a Revo pipeline.
- The package accepts a public API and semantic-versioning burden earlier than a private runtime would.
- A new script inside an installed provider family changes package code and pipeline data, not the host executor.
- A new provider family requires an explicit trusted provider module, credential/resource policy, and configuration;
  it does not require a concrete-id branch in the host executor.
- A host-core change is justified only when a provider needs a resource lifecycle the stable host contract cannot
  express, not merely because the provider adds another operation.
- The package must maintain production provider adapters, normalize their failure modes, and prove them with real local
  or provider-contract fixtures.
- Hosts must implement the stable infrastructure services and explicitly manage which definition/provider modules are
  trusted.
- Provider adapter changes that preserve the declared provider contract do not force a script version change. New
  execution plans pin the new adapter revision's digest; recoverable old plans resolve an immutable retained revision.
- Provider contracts, adapters, retained revisions, verification, and releases remain owned by this package and its
  release cycle.
