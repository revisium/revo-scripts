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

Readiness also reads one bounded `rules/branches/<base>?per_page=100` page. This is GitHub's evaluated branch view for
the bound credential, including matching repository and organization rulesets. A next page is `truncated`, malformed
identity is `unavailable`, and only a complete empty union means no required checks.

Review-thread operations verify the bound repository coordinates, pull-request number, and exact head before mutation.
Replies carry a hashed hidden operation marker so a retry can find the prior effect; the adapter fails closed when the
bounded comment window cannot prove absence. Pull-request merge sends the exact expected head SHA. The adapter never
selects a pipeline node or confirms a human gate.
