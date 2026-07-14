# `script:github/pull-request-readiness`

Reads state, draft status, mergeability, review decision, and bounded check contexts for one exact pull-request head.
It performs no mutation and returns `schema:githubReadiness/v1` with `ready` plus explicit stable blockers. It requires
`github.pull-request.readiness` and read access.
