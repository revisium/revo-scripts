# `script:github/pull-request/readiness`

| Field                    | Value                                              |
| ------------------------ | -------------------------------------------------- |
| Revision                 | `1`                                                |
| Effect class and effects | `read`; `github.read`                              |
| Permission and resource  | `github.pull-request.readiness`; `repository` read |
| Provider and idempotency | `revo.provider.github/v1`; read-only               |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

Reads state, draft status, mergeability, bounded check contexts, required-check identity, and bounded review threads
for one pull request. It performs no mutation and returns `schema:githubReadiness/v1` with the observed head,
provider-state digest, required/advisory check evidence, actionable non-outdated threads, independent collection
completeness, and a classification. A moved head is an observation, not an input-staleness failure. It requires
`github.pull-request.readiness` and read access.

Required identity is the bounded union of branch-protection contexts and applicable repository or organization
rulesets for the exact base branch. `complete`, `unavailable`, and `truncated` remain distinct; only complete identity
can classify an empty rollup as zero configured checks.

It replaces the orchestrator readiness observation only; the consumer owns route decisions. Verified by `test/contract/github/pull-request-readiness.test.ts` and `pnpm verify`.
