# Fetch GitHub provider

| Field       | Value                                    |
| ----------- | ---------------------------------------- |
| Provider id | `provider:github/fetch`                  |
| Contract    | `revo.provider.github/v1`                |
| Effects     | `github.read`, `github.write`            |
| Workspace   | none                                     |
| Credential  | manifest slot `token`, provider `github` |
| Coordinates | `{ owner, repository }`                  |

The adapter owns REST/GraphQL request construction, exact-head verification, response validation, replay
reconciliation, and stable fault mapping. Handlers receive only operation-specific clients; they never receive Fetch,
URLs, headers, tokens, or raw GitHub payloads.

Review-thread operations verify the bound repository coordinates, pull-request number, and exact head before mutation.
Replies carry a hashed hidden operation marker so a retry can find the prior effect; the adapter fails closed when the
bounded comment window cannot prove absence. Pull-request merge sends the exact expected head SHA. The adapter never
selects a pipeline node or confirms a human gate.
