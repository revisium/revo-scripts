# `script:git/commit`

| Field       | Value                            |
| ----------- | -------------------------------- |
| Version     | `1.0.0`                          |
| Effect      | `write`; `git.read`, `git.write` |
| Permission  | `git.commit.write`               |
| Resource    | `repository` with `write` access |
| Result      | `schema:gitChange/v1`            |
| Idempotency | required                         |

Creates one commit from the exact approved tree and parent on a pinned remote identity. The handler renders the
business-readable title and optional issue policy; the Node provider normalizes line endings, owns exactly one hashed
operation trailer, and compare-and-swaps the branch ref. It reconciles only the current branch head; a different head
fails with `revo.script.idempotency.conflict`.
