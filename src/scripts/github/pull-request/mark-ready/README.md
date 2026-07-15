# `script:github/pull-request/mark-ready`

| Field                    | Value                                                |
| ------------------------ | ---------------------------------------------------- |
| Version                  | `1.0.0`                                              |
| Effect class and effects | `write`; `github.read`, `github.write`               |
| Permission and resource  | `github.pull-request.mark-ready`; `repository` write |
| Provider and idempotency | `revo.provider.github/v1`; required                  |

Marks one exact draft pull-request head ready for review. It first reads and validates the pinned head; an already-ready
pull request is an idempotent success. It requires `github.pull-request.mark-ready`, write access, and an idempotency
key. Result: `schema:githubPullRequest/v1`.

It replaces the orchestrator draft-to-ready mutation and never interprets reviews or merges. Verified by `test/contract/github/pull-request-mark-ready.test.ts` and `pnpm verify`.
