# Provider README card

Every concrete provider adapter must keep a `README.md` beside its composition root with these sections.

## Identity

| Field          | Required value                   |
| -------------- | -------------------------------- |
| Provider id    | Stable implementation id         |
| Contract       | Exact provider contract major    |
| Owned effects  | Complete bounded list            |
| Workspace      | `required` or `none`             |
| Credentials    | Required aliases or `none`       |
| Public factory | Exported provider-family factory |
| Selection      | Sole implementation for contract |

## Responsibility

State the bounded infrastructure translation the adapter owns and the decisions it explicitly does not own.
State that startup rejects another implementation for the same contract and execution never falls back.

## Internal flow

Show the path from factory to provider module, bounded client, injected transport/executor, and parser/mapper. Identify every privileged value hidden from handlers.

## Failure contract

List stable provider error codes, cleanup behavior, abort behavior, and bounded payload rules.

## Verification

Link focused adapter tests, provider contract tests, and `pnpm verify`.
