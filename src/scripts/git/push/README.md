# `script:git/push`

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| Revision    | `1`                                       |
| Effect      | `publish`; `git.read`, `git.remote-write` |
| Permission  | `git.push.publish`                        |
| Resource    | `repository` with `publish` access        |
| Result      | `schema:gitChange/v1`                     |
| Idempotency | required                                  |

Revision `1` is immutable. Any observable change requires a larger integer revision; ranges, `latest`, SemVer parsing,
and fallback are unsupported.

Publishes only the exact `git-change/v1` head. The provider verifies the local branch, proves the head is a
fast-forward from the expected remote base, and uses an exact remote-head lease as an atomic compare-and-swap. It
never rewrites history and reads the remote head back. An already-published exact head is an idempotent success;
another remote head is a conflict.
