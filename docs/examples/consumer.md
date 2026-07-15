# Expanded consumer example

This document keeps the larger integration details out of the root README. It is illustrative but uses the public
facade and the same request/result contracts as production consumers.

## Host bindings

The host resolves opaque resource and credential aliases only after the package validates the selected manifest. A
repository binding grants a bounded access level and provider effects; a credential binding names an alias and provider.
The resolved absolute path and token remain private to the package-owned adapter.

```ts
const scripts = createRevoScripts({
  workspaces: workspaceResolver,
  credentials: credentialResolver,
  events: eventSink,
  clock,
});

const plan = scripts.resolveForPlan({
  id: 'script:github/pull-request/readiness',
  version: '1.0.0',
});

const result = await scripts.execute({
  executionId: 'run-42:readiness:1',
  idempotencyKey: 'run-42:readiness',
  script: plan.script,
  providers: plan.providers,
  input: { repositoryId: 'repository-123', number: 42 },
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: 'repository-123',
        access: 'read',
        grant: { permissions: ['github.pull-request.readiness'], effects: ['github.read'] },
        providerCoordinates: { github: { owner: 'revisium', repository: 'revo-scripts' } },
      },
    },
    credentials: { token: { alias: 'github-read-account', provider: 'github' } },
  },
  signal: new AbortController().signal,
});
```

## Operations and results

Git status returns bounded commit/tree captures and changed paths. Git commit and push use exact parent/head fences
and return a typed `git-change/v1` result. GitHub pull-request upsert, mark-ready, readiness, review-thread reply or
resolution, and merge each have their own input/result schema and stale-state policy. Merge additionally requires an
exact post-gate readiness artifact and returns a merge receipt.

Every result is either `{ ok: true, value, evidence, attempts }` or `{ ok: false, error, attempts }`. The package never
adds pipeline ids, node cursors, workspace paths, tokens, or artifact storage identities to a domain result.

## Failures and recovery

Consumers handle stable namespaced failure codes and decide whether a pipeline should stop, request a human decision,
or schedule another node attempt. The script itself never advances a pipeline cursor or opens a human gate. Typed
idempotency contracts let the central runtime reconcile a replay without duplicating a provider effect.

## Approval subjects, artifacts, and events

`script:approval/subject` builds a bounded approval payload; the host owns the actual human gate. Provider results and
evidence can be persisted by the host in its artifact envelope, but artifact storage is not owned by this package.
Lifecycle and custom events are emitted through the injected `EventSink`; secrets, tokens, paths, and raw provider
payloads are redacted before they leave package-owned boundaries.

For exact schemas, permissions, provider requirements, redaction rules, and recovery behavior, use the [runtime v1
specification](../specs/script-runtime-v1.spec.md) and the README card beside each script/provider implementation.
