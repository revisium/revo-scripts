# `script:git/status`

| Field             | Value                           |
| ----------------- | ------------------------------- |
| Script id         | `script:git/status`             |
| Version           | `1.0.0`                         |
| Effect class      | `read`                          |
| Effects           | `git.read`                      |
| Permission        | `git.status.read`               |
| Resource          | `repository` with `read` access |
| Provider contract | `revo.provider.git/v1`          |
| Idempotency       | `read-only`                     |

## Operation

Captures the current workspace as an immutable `git-tree:*` without mutating the real Git index. It returns the base
`git-commit:*`, at most 2,048 sorted changed paths, and `clean`. It performs no Git or GitHub mutation and returns no
workspace path or execution provenance.

## Files

- `types.ts` — input, result, and resource types.
- `schemas.ts` — exact input and output schemas.
- `manifest.ts` — permissions, resources, effects, timeout, retry, redaction, and events.
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
