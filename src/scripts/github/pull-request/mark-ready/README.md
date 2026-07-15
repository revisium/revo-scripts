# `script:github/pull-request-mark-ready`

Marks one exact draft pull-request head ready for review. It first reads and validates the pinned head; an already-ready
pull request is an idempotent success. It requires `github.pull-request.mark-ready`, write access, and an idempotency
key. Result: `schema:githubPullRequest/v1`.
