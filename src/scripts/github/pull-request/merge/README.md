# `script:github/pull-request/merge`

| Field                    | Value                                             |
| ------------------------ | ------------------------------------------------- |
| Version                  | `1.0.0`                                           |
| Effect class and effects | `publish`; `github.read`, `github.write`          |
| Permission and resource  | `github.pull-request.merge`; `repository` publish |
| Provider and idempotency | `revo.provider.github/v1`; required               |

Merges only one approved open, non-draft, live-mergeable pull request. Its closed input carries the exact PR artifact,
approval subject, active gate resolution, and post-gate readiness artifact. Normal approval accepts only `clean`
readiness; an override accepts only bounded advisory evidence and its sorted, unique, exact unresolved-thread audit.
Required checks, incomplete observations, closed/draft state, moved heads, and mergeability blockers are never bypassed.

The Fetch provider re-reads current PR metadata, exact source branch, and issue linkage before a single exact-head REST
squash merge and bounded exact-source-ref deletion. `close` requires the exact GitHub `closingIssuesReferences` identity;
`refs` requires the canonical non-closing `Refs` token. It reads back the merged exact source head and source-branch
deletion; a retry adopts the same exact already-merged PR and reconciles branch deletion without another merge.
It never repairs metadata or marks a PR ready. Result: `schema:githubPullRequestMergeResult/v1` with PR identity,
approved and merged head proof, optional merge commit, merge status, source-branch deletion, issue reference, and a
bounded override identity (`actor`, `auditFingerprint`, and exact `threadIds`) while omitting free-text gate and audit
fields.

It replaces the orchestrator merge effect and does not create a human authorization. Verified by `test/contract/github/pull-request-merge.test.ts` and `pnpm verify`.
