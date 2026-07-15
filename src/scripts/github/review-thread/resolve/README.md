# `script:github/review-threads/resolve`

| Field                    | Value                                                |
| ------------------------ | ---------------------------------------------------- |
| Revision                 | `1`                                                  |
| Effect class and effects | `publish`; `github.read`, `github.write`             |
| Permission and resource  | `github.review-thread.resolve`; `repository` publish |
| Provider and idempotency | `revo.provider.github/v1`; required                  |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

Consumes the closed response result from the response operation and processes its at-most-100 proofs in their recorded
order. For every item, the provider re-reads the exact bound repository, open pull-request head, thread, and the one
reply with the supplied id, marker, fingerprint, normalized-body digest, and pinned credential actor. It never resolves
a bare thread id or a thread without that proof.

The result reports `resolved` for a confirmed write and `already-resolved` only after the matching reply remains visible.
A partial crash therefore performs no duplicate resolution. This operation never posts replies and exposes no reply body,
actor identity, gate note, or raw provider payload. Verified by
`test/contract/github/review-thread-resolve.test.ts`,
`test/integration/providers/fetch-github-review-thread-resolve.test.ts`, and `pnpm verify`.
