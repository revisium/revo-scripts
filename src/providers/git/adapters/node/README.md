# Node Git provider

| Field          | Value                     |
| -------------- | ------------------------- |
| Provider id    | `provider:git/node`       |
| Contract       | `revo.provider.git/v1`    |
| Owned effects  | `git.read`                |
| Workspace      | required                  |
| Credentials    | none in the current slice |
| Public factory | `nodeGitProviders`        |

## Responsibility

The adapter translates bounded Git client calls into Git CLI invocations inside a host-resolved workspace. It owns command construction, process-result handling, and parsing of the selected Git output protocol.

The adapter does not validate script input/result schemas, choose a script, allocate a workspace, select credentials, retry an operation, or decide pipeline state.

## Internal flow

```text
nodeGitProviders -> NodeGitProvider -> NodeGitStatusClient -> ProcessExecutor
                                                       -> PorcelainV2Parser
```

`ProcessExecutor` is injected by the consumer composition root. `NodeGitStatusClient` always invokes `git status --porcelain=v2 --branch -z` and returns the bounded `GitStatusSnapshot` contract.

## Verification

- Adapter behavior: `test/unit/providers/git-node-provider.test.ts`
- Real local Git contract: `test/integration/providers/node-git-provider.test.ts`
- Full repository gate: `pnpm verify`
