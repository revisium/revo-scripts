# Fetch GitHub provider

| Field       | Value                                         |
| ----------- | --------------------------------------------- |
| Provider id | `provider:github/fetch`                       |
| Contract    | `revo.provider.github/v1`                     |
| Effects     | `github.read`, `github.write`                 |
| Workspace   | none                                          |
| Credential  | manifest slot `token`, provider `github`      |
| Coordinates | `{ owner, repository }`                       |
| Selection   | sole `revo.provider.github/v1` implementation |

The adapter owns REST/GraphQL request construction, exact-head verification, response validation, replay
reconciliation, and stable fault mapping. Handlers receive only operation-specific clients; they never receive Fetch,
URLs, headers, tokens, or raw GitHub payloads.

A static typed permission-to-factory table selects the six bounded clients. Exactly one supported permission may be
present; zero or multiple supported permissions keep the stable capability fault, and unrelated permissions never
widen the returned client.

Startup rejects another implementation for the same provider contract; execution never falls back.

Readiness also reads one bounded `rules/branches/<base>?per_page=100` page. This is GitHub's evaluated branch view for
the bound credential, including matching repository and organization rulesets. A next page is `truncated`, malformed
identity is `unavailable`, and only a complete empty union means no required checks.

Review-thread operations verify the bound repository coordinates, pull-request number, and exact head before mutation.
Replies carry a hashed hidden operation marker so a retry can find the prior effect; the adapter fails closed when the
bounded comment window cannot prove absence. Pull-request merge sends the exact expected head SHA. The adapter never
selects a pipeline node or confirms a human gate.

The private `fetchGitHubProviders` family factory owns the ordinary-source implementation digest pin and injects it
into the internal provider constructor. The identity generator hashes only the provider class's emitted transitive
closure and replaces exactly that named factory pin. Because the factory is outside the closure, the digest does not
hash itself. The check path recomputes without writing, and the contract suite proves isolation from Node Git and
built-in definition changes.
