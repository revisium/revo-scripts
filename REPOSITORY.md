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

## Current layout

```text
src/
  spec/       portable manifests, schemas, definitions, results, and errors
  runtime/    definition, registry, validation, events, redaction, and execution
  git/        bounded Git capabilities and built-in Git scripts
  testing/    public contract-test mechanics and deterministic fakes

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
or broad barrels to make the target tree appear complete. `src/github/` is therefore deferred until its first bounded
script or capability contract is implemented.

## Dependency direction

```text
spec <- runtime
spec + runtime <- git
spec + runtime <- github
spec + runtime + git + github <- testing
```

- `spec` is the dependency leaf.
- Runtime is provider-neutral and does not import built-in Git or GitHub definitions.
- Git and GitHub do not import one another.
- Production source never imports `testing`, test support, build output, or repository scripts.
- Tests import explicit modules; there is no broad test-support barrel.
- Public consumers use the export map and never deep-import internal files.

`.oxlintrc.architecture.json` enforces this graph and zero value or type dependency cycles through Oxlint's module
graph. Published boundaries are enforced independently through explicit exports, declarations, package smoke tests,
`publint`, Are The Types Wrong, and pack-content validation.

## Ownership boundaries

The package owns script definition and one-script execution. It does not own pipeline routing, durable workflow state,
workspace lifecycle, credential storage, human gates, artifact persistence, DBOS, Prisma, or NestJS.

Provider capabilities are bounded domain ports. Raw process execution, workspace paths, environment maps, tokens,
generic HTTP or GraphQL clients, and global mutable loggers are not handler capabilities.

## Package surface

The root entrypoint intentionally repeats only the four primary runtime functions: `defineScript`,
`createScriptSchema`, `createScriptRegistry`, and `executeScript`. This is the approved curated convenience exception
to the single-public-path rule. Types, faults, built-ins, and testing mechanics remain on explicit domain subpaths.
Adding a source file does not make it public; `package.json` is authoritative for shipped exports.

Testing utilities are public only through `@revisium/revo-scripts/testing`. Private fixtures and repository validation
scripts are never shipped as package API.

## Change routing

- Public API or architecture changes require an approved Draft or Accepted ADR/spec before implementation. Draft
  contracts must be accepted before their behavior is described as shipped.
- Behavior changes start with a failing test in the owning layer.
- Built-in operation changes update their contract documentation and tests together.
- Verification follows `VERIFICATION.md`; review follows `REVIEW.md`.
- Publishing, release creation, and consumer cutover require separate approval.
