# Testing

This document defines how behavior in `@revisium/revo-scripts` is proven. Exact executable commands remain in
[VERIFICATION.md](../VERIFICATION.md).

The policy adapts the useful library-level rules from Revo's test architecture. Host, DBOS, pipeline, MCP, GraphQL,
CLI, and durable-recovery test layers do not belong in this package.

## Principles

- Behavior changes follow an explicit red -> green -> refactor cycle. The author MUST first run the focused test and
  confirm that it fails because the requested behavior is absent, then implement the smallest passing change, and only
  then improve structure without changing behavior.
- Every behavior has one primary proof layer. Higher layers may corroborate it but must not duplicate its full input
  partition.
- Tests assert observable results, stable error codes, and causal evidence. A terminal success or failure alone is not
  sufficient when the contract exposes a reason.
- Fixtures contain every field read by production code. Deliberate omission is itself asserted as the tested behavior.
- Test support owns mechanics such as fakes, recording sinks, clocks, and builders. It does not choose product outcomes
  or hide assertions.
- A test body stays at one abstraction level: it makes the behavior-specific setup, action, and observable outcome easy
  to identify. Repeated registry wiring, clocks, sinks, host bindings, and valid baseline manifests belong in typed test
  support once they obscure that behavior.
- Tests use public contracts unless the owning layer is a focused unit test for a private pure function.
- Skips and quality-rule exclusions require an owner, rationale, and expiry or removal condition.

## Test readability and suite structure

- Prefer small typed builders, scenario harnesses, and recording fakes over a fluent or natural-language test DSL. Test
  support should remove mechanics while leaving behavior choices and assertions visible in ordinary TypeScript.
- Builders expose explicit domain overrides and fail closed on unsupported combinations. They MUST NOT use an
  unbounded deep merge, infer the expected product outcome, or derive expected values from the actual result.
- Do not extract a one-off setup merely to shorten a test. A helper earns its name when it removes repeated mechanics
  or gives a stable domain concept one clear representation.
- One suite file owns one behavioral axis. Split a suite when independent concerns such as preflight, retry, deadlines,
  event policy, payload bounds, or provider lifecycle can change and be reviewed separately.
- More than 400 lines or ten top-level scenarios is a review trigger, not an automatic failure. The author MUST check
  whether the suite contains multiple behavioral axes; a `describe` block is not a substitute for splitting independent
  contracts into focused files.
- Focused files may share private mechanics from `test/support/<area>/`. They MUST NOT introduce a broad support barrel,
  hide assertions, or move repository-only fixtures into the published `src/testing` API.
- Keep exceptional mechanics explicit when they are the subject of the test. A deadline test may control timers and an
  event-sink test may define a rejecting sink directly even when the common path uses a scenario harness.

## Assertion style

- Use `expect(actual).toEqual(expected)` for complete domain objects, results, failures, events, and manifests. Prefer
  one readable expected value over a sequence of field-by-field assertions.
- The expected value MUST be written independently of the actual value. Do not spread or otherwise derive the expected
  object from the value under test.
- Partial matching is reserved for contracts that intentionally leave unrelated fields open. It MUST NOT conceal a
  field that is part of the owned contract.
- Snapshots are reserved for complex, deterministic, serializable representations whose complete diff is easier to
  review than an object literal. Small objects, stable error codes, and behavior decisions use explicit assertions.
- A snapshot MUST exclude or normalize timestamps, random identifiers, secrets, machine paths, and other unstable
  values unless the test specifically owns that representation.

## Test layers

| Layer        | Owns                                                                                                                   | Must not own                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Unit         | Pure validators, classifiers, canonicalization, redaction, retry decisions, and focused registry behavior.             | Package export claims or broad script lifecycle claims. |
| Contract     | One script or runtime contract through typed public inputs, bounded clients, events, results, and failures.            | Private implementation shape or host orchestration.     |
| Provider     | Privileged binding resolution, bounded client construction, real local/provider fixtures, and secret/path containment. | Pipeline routing or handler business decisions.         |
| Consumer     | One facade path for arbitrary script ids, startup composition, and absence of per-operation host wiring.               | Provider implementation details or pipeline policy.     |
| Architecture | Dependency direction, cycle absence, forbidden imports, deep-import prevention, and test-to-production direction.      | Built consumer export resolution or runtime behavior.   |
| Package      | Built declarations, export map, ESM resolution, packed contents, and consumer-visible type/runtime imports.            | Script semantics or private source imports.             |

Unit and contract tests may share deterministic builders and recording fakes from explicit support modules. There is no
broad test barrel. Production modules never import test support.

Consumer integration tests construct the same `createRevoScripts` object as a host application and execute scripts
through public package entrypoints. System behavior is replaced at the narrow package-owned boundary, such as
`ProcessExecutor`, `WorkspaceResolver`, or `CredentialResolver`; tests do not globally mock `node:child_process`, the
filesystem, or private implementation classes. Each production adapter also keeps the smallest useful real-system
contract, such as a temporary local Git repository, to prove that its boundary wiring is executable.

The packed-consumer gate builds a tarball, extracts that exact artifact into an isolated consumer project, typechecks
its public declarations, runs one script through injected ports, and proves that an undeclared deep import is rejected.
It remains outside semantic coverage ownership because it proves packaging and consumer resolution rather than source
branches.

## Runtime proof

The runtime foundation requires tests for:

- closed manifest validation and stable diagnostics;
- input and result schema validation;
- effect, permission, resource, retry, and idempotency coherence;
- deterministic definition digest generation;
- build-generated definition identity freshness and digest participation;
- duplicate registration, sealing, exact lookup, and missing-definition failures;
- coexistence and exact lookup of two immutable versions of one script id;
- readonly handler input and one-handler invocation per attempt;
- wall-clock timeout and abort propagation;
- a never-settling handler or event sink remains bounded by the platform wall-clock deadline;
- bounded retry of typed transient failures only;
- structured conversion of unknown failures;
- lifecycle and custom event allowlists;
- redaction before events or failures leave the runtime;
- input, result, event, error, and evidence payload bounds.

The injected `ScriptClock` controls observable timestamps and retry sleeps. The hard deadline intentionally uses the
platform timer so a deterministic or faulty host clock cannot disable the safety bound; timeout tests use fake platform
timers when they need deterministic expiry.

Tests for generic runtime behavior use arbitrary script identifiers. The executor must not pass because a test happens
to use a built-in identifier.

## Per-script contract proof

Every built-in script has contract tests proving:

- its manifest and schemas are valid and closed;
- documented examples validate against the same schemas;
- declared permissions, resources, provider contracts, effects, timeout, retry, idempotency, events, and redaction
  match observed use;
- prepared resource, permission, and effect grants satisfy the manifest before handler invocation;
- missing provider clients fail before the handler performs an effect;
- success returns the documented bounded result;
- provider failures map to stable namespaced errors without leaking secrets;
- undeclared events and insufficient prepared effect grants are rejected;
- read-only operations perform no mutation;
- mutation operations reject stale preconditions;
- operations with required idempotency reconcile a replay and a crash-after-effect window without duplicating an
  external effect.

Git commit, Git push, GitHub pull-request, review-thread, and merge suites make the mutation requirements executable.
They prove stale precondition rejection, exact-head behavior, replay reconciliation, and no duplicate external effect.

## Git status proof

`script:git/status` proves the safe read-only workspace-capture path. Its complete contract requires that it:

- accepts a closed empty input and one prepared repository resource named `repository`;
- uses only a bounded read-only package-owned Git client;
- returns exact `git-commit:*` and `git-tree:*` captures, cleanliness, and at most 2,048 bounded changed paths;
- captures the workspace tree through a temporary Git index without changing the real index;
- does not return raw provider output, a workspace path, or provenance;
- invokes no write client;
- emits the standard lifecycle events;
- maps missing access, timeout, provider failure, invalid input, and invalid result to their stable error families.

An in-memory recording port remains authoritative for the handler contract. The package-owned process-backed Git
adapter also has a real temporary-repository contract proving that `script:git/status` executes without a
consumer-provided `readStatus` implementation. Recording fakes remain authoritative for access denial, no-call, retry,
timeout, and redaction partitions.

## Provider and consumer proof

Every package-owned provider requires tests proving:

- invalid definition, input, digest, binding, access, permission, or effect grants resolve no privileged host value;
- only manifest-declared workspace and credential bindings are resolved;
- every provider client is attached only to the resource named by its manifest requirement;
- each provider construction receives only credential slots assigned to its manifest requirement;
- provider coordinates are validated from immutable bindings and are never reconstructed from mutable workspace state;
- absolute paths, secrets, environment values, commands, and raw provider payloads never reach handlers, results,
  events, artifacts, or public failures;
- bounded clients expose no generic command, filesystem-root, HTTP, GraphQL, or credential access;
- duplicate provider client keys fail with `revo.script.provider.client_conflict` before handler invocation;
- provider construction, calls, and disposal obey the one execution deadline and abort signal;
- provider-specific transient failures map to stable package faults before central retry;
- real local or provider-contract fixtures exercise the production adapter without requiring host operation logic;
- provider contract majors are selected by manifest requirements, while execution resolves the exact implementation
  id, digest, and package provenance pinned in the plan;
- multiple implementations or contract majors never introduce implicit latest selection or fallback;
- changing the new-plan default does not change execution or recovery for an existing exact pin.

The consumer compatibility suite requires at least two arbitrary definitions in one provider family and proves that:

- both execute through the same `createRevoScripts().execute(...)` path;
- the application layer, host services, and provider registry contain no concrete script-id branch;
- adding the second definition requires no per-operation host capability or registration call;
- adding a new script under an existing provider contract requires no consumer executor change;
- a selected definition family whose provider contract is absent fails at startup;
- an exact execution pin whose retained implementation is absent fails preflight rather than falling back;
- a new provider module composes without changing the generic executor.

Version-retention tests and release checks MUST prove that a published `(script id, version)` remains byte-stable and
that adding an unrelated definition does not change its definition digest. Provider-family tests MUST prove that one
new-plan default and all retained immutable revisions are registered without consumer enumeration. Removing a script
version, provider contract major, or exact provider implementation requires external pin-audit evidence; a local green
suite alone is not evidence that no pipeline or recoverable run still references it.

Architecture tests MUST distinguish runtime, host ports, application composition, provider contracts, provider
adapters, and concrete scripts. They enforce that provider contracts cannot import privileged host types, scripts
import only bounded contracts in their own provider category, adapters never import scripts, provider families do not
import one another, only application composes adapters with definitions, and production never imports testing.
An architecture configuration change MUST be verified with a temporary representative forbidden import. A green run
against a graph that happens to contain no violation does not prove that an override or path pattern is active.

## Coverage and quality metrics

- Coverage includes owned production source and excludes generated output, declarations, fixtures, test support,
  package tarballs, and build artifacts.
- Coverage thresholds are a regression floor, not a substitute for contract completeness.
- New production files are not excluded merely to satisfy a threshold or Sonar result.
- Package and architecture tests remain in the required local and CI lane even when they do not contribute meaningful
  production line coverage.

## Authoring workflow

1. Select the primary test layer.
2. Add the smallest failing test that expresses the missing behavior.
3. Run the focused test and confirm the failure is caused by the missing behavior, not a broken fixture or test setup.
4. Implement the smallest sufficient change.
5. Run the focused owning suite.
6. Refactor only after the test is green; keep each unit at one abstraction level.
7. Run `pnpm verify` before handoff, commit, or publication.
8. Run applicable conditional and remote gates from `VERIFICATION.md`.
