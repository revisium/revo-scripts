# `script:github/pull-request/upsert`

| Field                    | Value                                            |
| ------------------------ | ------------------------------------------------ |
| Revision                 | `1`                                              |
| Effect class and effects | `write`; `github.read`, `github.write`           |
| Permission and resource  | `github.pull-request.upsert`; `repository` write |
| Provider and idempotency | `revo.provider.github/v1`; required              |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

Creates or reconciles one open pull request for exact head/base branches. It reconciles title, body, and base branch.
Existing state must match the pinned head and requested draft state; draft transitions belong to the separate
mark-ready operation, so a mismatch fails closed. It requires `github.pull-request.upsert`, write access, a
host-derived idempotency key, GitHub coordinates, and the `token` credential slot. Result:
`schema:githubPullRequest/v1`.

It replaces the orchestrator pull-request creation/update effect; it does not decide readiness, merge authorization, or pipeline state. See `test/contract/github/pull-request-upsert.test.ts` and `pnpm verify`.
