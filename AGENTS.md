# Revo Scripts Repository

This file is the repository-local contract for coding agents. When this repository is checked out inside the Revisium workspace, the workspace canonical agent playbook also applies. This file wins for concrete commands, package constraints, and repository policy.

## Repository facts

- Package: `@revisium/revo-scripts`.
- Package manager: pnpm 11.13.0 through Corepack.
- Runtime: Node.js `>=24.11.1 <25`.
- Language: strict TypeScript 7, ESM, and NodeNext module resolution.
- Protected base branch: `master`.
- Primary local gate: `pnpm verify`.
- Static analysis: SonarCloud through the scripts and workflow committed here.
- Current implementation: public SDK, one-script runtime, testing kit, and read-only Git status proof.
- The package remains unpublished; publishing and downstream integration require separate approval.

## Required reading

Before editing, inspect:

1. `README.md` for the public package status and supported commands.
2. `REPOSITORY.md` for source-of-truth order, ownership boundaries, and dependency direction.
3. `docs/README.md` and the relevant ADR/spec when architecture or public behavior changes.
4. `docs/testing.md` before adding or changing runtime or script tests.
5. `VERIFICATION.md` for exact required, conditional, and remote gates.
6. `REVIEW.md` for the review blockers.
7. `package.json`, the export map, and the relevant source and tests.

Draft target documents do not describe stable behavior beyond the implemented and tested surface. Follow the
current-versus-target source-of-truth rules in `REPOSITORY.md` instead of inferring behavior from neighboring repositories.

## Working rules

- Keep changes scoped to the approved request and preserve unrelated work.
- Do not commit directly to `master`.
- Do not push, create or update a pull request, merge, publish npm packages, or mutate external services without the corresponding approval.
- Run targeted checks while iterating and the complete `pnpm verify` gate before handoff or publication.
- After a push, inspect CI, Sonar findings when accessible, and unresolved review threads. Do not treat a top-level green status as proof that issue-level findings are clear.
- Record missing credentials or provider access as skipped or blocked, never as passed.

## Engineering rules

- Develop behavior through a verified red -> green -> refactor cycle. Prefer contract and observable-behavior tests
  over implementation-detail assertions.
- Give every behavior one primary proof layer as defined in `docs/testing.md`; do not duplicate lower-layer input
  partitions in broader contract or package tests.
- Keep fixtures production-shaped for every field the implementation reads. Test support owns mechanics and never
  selects product outcomes or hides assertions.
- Assert stable error codes and causal evidence, not only terminal success or failure.
- Use the smallest sufficient implementation. Add abstractions only for an existing boundary, variation, or test seam.
- Keep each unit at one abstraction level and give it one bounded responsibility.
- Keep business decisions separate from process, filesystem, network, provider, and presentation mechanics.
- Use braces for every control-flow body, including a one-statement `if`, `else`, or loop.
- Model expected failures explicitly with typed results or errors. Never swallow errors silently.
- Preserve strict types. Do not use `any`, `@ts-ignore`, broad casts, unchecked assertions, or weaker public types to bypass a failing gate.
- Reject or bound externally supplied collections, strings, artifacts, and payloads at their owning boundary.
- Prefer names, types, and decomposition over explanatory comments. Comments are reserved for non-obvious invariants, compatibility constraints, protocols, or lifecycle hazards.
- A quality-rule exception, exclusion, or skipped test must be narrow and identify its owner, rationale, and expiry or
  removal condition.
- Do not introduce dependency cycles or deep imports around the export map. Duplicate public paths require an explicit
  curated-root decision in `REPOSITORY.md`; broad or accidental aliases remain forbidden.
- Runtime code must not depend on test helpers, generated output, build scripts, or repository tooling.
- Generated files, fixtures, coverage, and build output must stay outside production quality metrics without hiding owned production source.
- Prefer complete `toEqual` assertions for owned object contracts. Use snapshots only for complex deterministic
  representations under the policy in `docs/testing.md`.

## Public package contract

- Public entrypoints are declared explicitly in `package.json`; filesystem layout alone never makes a module public.
- Public TypeScript changes require runtime tests where behavior exists, type-surface coverage, declaration validation, export validation, and updated README examples.
- Keep ESM-only behavior intentional. Do not add CommonJS compatibility, root barrels, fallback exports, or duplicate entrypoints without an approved compatibility requirement.
- Runtime dependencies require a demonstrated package responsibility and dependency-DAG review.
- Do not publish from a local machine or add publishing credentials to repository files.

## Verification

Follow `VERIFICATION.md`. If it conflicts with scripts or CI, report the mismatch and use the safest current command set until the contract is corrected. Never claim an unexecuted gate passed.
