# Node Git provider

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Provider id    | `provider:git/node`                                            |
| Contract       | `revo.provider.git/v1`                                         |
| Owned effects  | `filesystem.read`, `git.read`, `git.write`, `git.remote-write` |
| Workspace      | required                                                       |
| Credentials    | none                                                           |
| Public factory | `nodeGitProviders`                                             |
| Selection      | sole `revo.provider.git/v1` implementation                     |

## Responsibility

The adapter translates bounded Git client calls into Git CLI invocations inside a host-resolved workspace. It owns command construction, process-result handling, and parsing of the selected Git output protocol.

The adapter does not validate script input/result schemas, choose a script, allocate a workspace, select credentials, retry an operation, or decide pipeline state.
Startup rejects another implementation for the same provider contract; execution never falls back.

## Internal flow

```text
nodeGitProviders -> NodeGitProvider -> operation-specific bounded client -> ProcessExecutor
```

`ProcessExecutor` is injected by the consumer composition root. The provider constructs only the client permitted by
the manifest resource access: status read, local commit, or remote push. Status uses porcelain v2 plus a temporary
index tree capture; commit uses `commit-tree` and compare-and-swap `update-ref`; push validates local and remote heads
and never rewrites history. Commit authorship and timestamp come from validated script input rather than mutable Git
configuration, making the object identity reproducible after a crash.

## Verification

- Adapter behavior: `test/unit/providers/`
- Real local Git contracts: `test/integration/providers/node-git-provider.test.ts` and
  `test/integration/providers/node-git-mutations.test.ts`
- Full repository gate: `pnpm verify`
