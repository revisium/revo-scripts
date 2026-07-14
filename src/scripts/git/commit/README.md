# `script:git/commit`

| Field       | Value                            |
| ----------- | -------------------------------- |
| Version     | `1.0.0`                          |
| Effect      | `write`; `git.read`, `git.write` |
| Permission  | `git.commit.write`               |
| Resource    | `repository` with `write` access |
| Result      | `schema:gitChange/v1`            |
| Idempotency | required                         |

Creates one commit from the exact approved tree and parent. Input includes bounded author name, email, and ISO-8601
timestamp; the provider applies that identity to both Git author and committer fields so the commit object is stable
across a crash before the branch-ref update. The Node provider uses `commit-tree`, records a hashed operation trailer,
and compare-and-swaps the branch ref. A replay returns or deterministically recreates the same commit; a moved or
different branch fails with `revo.script.idempotency.conflict`.
