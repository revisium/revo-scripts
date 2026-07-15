# `script:github/pull-request-merge`

Merges one open, non-draft pull request with the exact pinned head SHA and selected `merge`, `squash`, or `rebase`
method. It requires `github.pull-request.merge`, publish access, and an idempotency key. An already-merged exact head is
an idempotent success. Result: `schema:githubPullRequest/v1` including `mergeCommitSha`.
