# Script README card

Every built-in operation must keep a `README.md` beside its definition with these sections.

## Identity

| Field              | Required value           |
| ------------------ | ------------------------ |
| Script id          | Stable namespaced id     |
| Revision           | Exact positive integer   |
| Effect class       | Manifest effect class    |
| Effects            | Complete effect list     |
| Permissions        | Complete permission list |
| Resources          | Names, kinds, and access |
| Provider contracts | Exact required contracts |
| Idempotency        | Exact policy             |

## Operation

Describe one bounded business operation, its typed result, and its explicit non-responsibilities.

State that `(script id, revision)` is immutable, every observable change increments the revision, and consumers use no
range, `latest`, tag, SemVer parser, or fallback.

## Files

Explain the operation's types, schemas, manifest, handler, and composition root. Keep the handler stateless and keep each concrete class in its own file.

## Dependencies

Show dependencies from composition to handler and bounded provider contracts. State which adapter, host, and application imports are forbidden.

## Failure and event contract

List stable failure codes, declared custom events, evidence, and redaction behavior.

## Verification

Link the primary contract test, any focused policy tests, facade proof when applicable, and `pnpm verify`.
