# `script:github/review-thread-respond`

Replies once to one review thread belonging to the bound repository, exact pull-request number, and head. The provider
appends a hashed hidden operation marker and reconciles it on retry, preventing duplicate replies. It requires
`github.review-thread.respond`, write access, and an idempotency key. Result: `schema:githubReviewThread/v1`.
