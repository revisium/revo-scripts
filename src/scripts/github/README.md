# GitHub scripts

This category contains bounded GitHub pull-request and review-thread operations. Every operation owns one manifest,
closed input/result schemas, a stateless handler, exact stale-state fences, and a README card. Infrastructure remains
under `src/providers/github`; scripts import only its bounded contracts.

| Operation                 | Permission                       | Result                                    |
| ------------------------- | -------------------------------- | ----------------------------------------- |
| `pull-request/upsert`     | `github.pull-request.upsert`     | `github-pull-request/v1`                  |
| `pull-request/mark-ready` | `github.pull-request.mark-ready` | `github-pull-request/v1`                  |
| `pull-request/readiness`  | `github.pull-request.readiness`  | `github-readiness/v1`                     |
| `pull-request/merge`      | `github.pull-request.merge`      | `github-pull-request-merge-result/v1`     |
| `review-threads/respond`  | `github.review-thread.respond`   | `github-review-threads-respond-result/v1` |
| `review-threads/resolve`  | `github.review-thread.resolve`   | `github-review-threads-resolve-result/v1` |
