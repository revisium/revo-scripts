# `script:github/review-thread-resolve`

Resolves one review thread belonging to the bound repository, exact pull-request number, and head. An already-resolved
thread is an idempotent success. It requires `github.review-thread.resolve`, write access, and an idempotency key. Result:
`schema:githubReviewThread/v1`.
