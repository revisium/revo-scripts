# `script:git/status`

| Field             | Value                           |
| ----------------- | ------------------------------- |
| Script id         | `script:git/status`             |
| Revision          | `1`                             |
| Operation class   | `read`                          |
| Operations        | `filesystem.read`, `git.read`   |
| Permission        | `git.status.read`               |
| Resource          | `repository` with `read` access |
| Provider contract | `revo.provider.git/v1`          |
| Idempotency       | `read-only`                     |

Revision `1` is immutable. Any observable change requires a larger integer revision.

## Operation

Re-observes the pinned `resource`, `git-commit:*`, and `git-tree:*` inputs without mutating the real Git index. A
moved capture fails closed. It returns the base, at most 2,048 sorted changed paths, and `clean`, with no workspace
path or execution provenance.

## Files

- `schemas.ts` — exact input/output schemas, schema-derived public aliases, and explicit resource capabilities.
- `manifest.ts` — permissions, resources, operations, timeout, retry, redaction, and events.
- `git-status.handler.ts` — stateless bounded operation.
- `script.ts` — definition composition root.

## Dependencies

```text
script.ts -> manifest.ts
          -> schemas.ts
          -> GitStatusHandler -> GitStatusClient contract
```

The handler receives the prepared `repository.clients.git` capability. It never receives a workspace path, process
executor, token, or provider adapter.

## Verification

- Contract behavior: `test/contract/git/status.test.ts`
- Consumer execution: `test/integration/consumer/git-status/`
- Full repository gate: `pnpm verify`
