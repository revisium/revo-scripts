# `script:github/pull-request-upsert`

Creates or reconciles one open pull request for exact head/base branches. It reconciles title, body, and base branch.
Existing state must match the pinned head and requested draft state; draft transitions belong to the separate
mark-ready operation, so a mismatch fails closed. It requires `github.pull-request.upsert`, write access, a
host-derived idempotency key, GitHub coordinates, and the `token` credential slot. Result:
`schema:githubPullRequest/v1`.
