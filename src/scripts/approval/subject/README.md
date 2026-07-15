# `script:approval/subject`

| Field        | Value                     |
| ------------ | ------------------------- |
| Script id    | `script:approval/subject` |
| Revision     | `1`                       |
| Effect class | `pure`                    |
| Idempotency  | `read-only`               |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

The script validates and returns one provider-neutral approval subject. Its result contains domain identity,
revision, display text, evidence references, and optional risk. It never returns run, node, attempt, workspace, or
execution-plan provenance; the host adds that metadata only when it creates an artifact envelope.
