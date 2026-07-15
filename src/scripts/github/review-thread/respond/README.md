# `script:github/review-threads/respond`

| Field                    | Value                                                |
| ------------------------ | ---------------------------------------------------- |
| Revision                 | `1`                                                  |
| Effect class and effects | `publish`; `github.read`, `github.write`             |
| Permission and resource  | `github.review-thread.respond`; `repository` publish |
| Provider and idempotency | `revo.provider.github/v1`; required                  |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

Accepts closed triage for one exact open pull request and processes at most 100 unique selected threads in triage order.
Only `fix` and `wontfix` items are selected. A `question` item requires a matching bounded continuation resolution;
without one the input is rejected. The provider re-reads the bound
repository, pull request, head, and each selected thread before mutation. It appends the canonical terminal marker
bound to the idempotency key, PR number, head, thread id, and LF-normalized reply body, then reads back exactly one
reply by the pinned credential actor. Ambiguous, foreign, stale, malformed, or mismatched reply proof blocks.

An existing exact reply returns `already-replied`; a partial crash performs no duplicate write. The bounded result carries
only thread ids, dispositions, reply ids, marker/fingerprint, and statuses—never reply text, gate notes, actor identity,
or provider payloads. This operation never resolves threads. Verified by
`test/contract/github/review-thread-respond.test.ts`,
`test/integration/providers/fetch-github-review-thread-respond.test.ts`, and `pnpm verify`.
