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
- Tests use public contracts unless the owning layer is a focused unit test for a private pure function.
- Skips and quality-rule exclusions require an owner, rationale, and expiry or removal condition.

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

| Layer        | Owns                                                                                                              | Must not own                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Unit         | Pure validators, classifiers, canonicalization, redaction, retry decisions, and focused registry behavior.        | Package export claims or broad script lifecycle claims. |
| Contract     | One script or runtime contract through typed public inputs, capabilities, events, results, and failures.          | Private implementation shape or host orchestration.     |
| Architecture | Dependency direction, cycle absence, forbidden imports, deep-import prevention, and test-to-production direction. | Built consumer export resolution or runtime behavior.   |
| Package      | Built declarations, export map, ESM resolution, packed contents, and consumer-visible type/runtime imports.       | Script semantics or private source imports.             |

Unit and contract tests may share deterministic builders and recording fakes from explicit support modules. There is no
broad test barrel. Production modules never import test support.

## Runtime proof

The runtime foundation requires tests for:

- closed manifest validation and stable diagnostics;
- input and result schema validation;
- effect, permission, resource, retry, and idempotency coherence;
- deterministic definition digest generation;
- duplicate registration, sealing, exact lookup, and missing-definition failures;
- input immutability and one-handler invocation per attempt;
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
- declared permissions, resources, effects, timeout, retry, idempotency, events, and redaction match observed use;
- prepared resource, permission, and effect grants satisfy the manifest before handler invocation;
- missing capabilities fail before the handler performs an effect;
- success returns the documented bounded result;
- provider failures map to stable namespaced errors without leaking secrets;
- undeclared events and insufficient prepared effect grants are rejected;
- read-only operations perform no mutation;
- mutation operations reject stale preconditions;
- operations with required idempotency reconcile a replay and a crash-after-effect window without duplicating an
  external effect.

The last two mutation requirements become executable gates when the first mutation script is added. They must not be
implemented as empty placeholder tests before then.

## First built-in proof

The first built-in is `script:git/status`. Its contract suite proves the initial safe read-only path and will expand
with provider adapters. Its complete contract requires that it:

- accepts a closed empty input and one prepared repository resource named `repository`;
- uses only a bounded read-only Git status capability;
- returns branch, head, detached, cleanliness, and bounded staged, unstaged, untracked, and conflicted counts;
- does not return an unbounded file list or raw provider output;
- invokes no write capability;
- emits the standard lifecycle events;
- maps missing access, timeout, provider failure, invalid input, and invalid result to their stable error families.

An in-memory recording port is authoritative for the package contract. A real process-backed Git adapter is a separate
integration surface and is not required for the first runtime slice.

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
