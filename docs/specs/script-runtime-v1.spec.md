# Script runtime v1

`@revisium/revo-scripts` owns script definitions, manifest validation, provider
adapters, resource/credential safety and one physical attempt. It does not own
pipeline transitions, persistence, or retry scheduling.

## Terms

- A **binding input** is compact resource references and credential aliases from
  a run profile.
- A **prepared binding** is the portable, immutable validation snapshot. It
  contains no workspace path, credential secret, client, signal or disposer.
- An **execution** is one durable operation. `executionId` is its only package
  idempotency identity.
- An **attempt** is one physical handler/provider call. `attemptId` identifies
  that call and `attemptOrdinal` starts at one.

## Host composition

```ts
const scripts = createRevoScripts({
  definitions, // optional: package built-ins are the default
  providers, // optional: package providers are the default
  host: { resources, workspaces, credentials, clock },
});
```

`resources.inspect(ref)`, `workspaces.inspect(ref)` and
`credentials.inspect(alias)` provide metadata only. The package uses them while
preparing a binding. `workspaces.acquire(ref)` and
`credentials.acquire(alias)` return the live path or secret only immediately
before an attempt; all acquired leases and provider clients are disposed on
every outcome.

## Durable host API

```ts
const binding = await scripts.prepareBinding(bindingInput, { signal });
const result = await scripts.executeAttempt(
  {
    executionId,
    attemptId,
    attemptOrdinal,
    script: binding.script,
    binding,
    input,
  },
  { signal, events },
);
```

`prepareBinding` validates the exact script pin, all resource and credential
slots, grants, provider compatibility and metadata. It rejects malformed or
unauthorized data with `ScriptFault` before external dispatch.

`executeAttempt` validates the pinned binding and input, acquires live host
handles just in time, then calls the handler at most once. It returns a terminal
`succeeded`, `failed`, `cancelled`, or `timedOut` result when completion is
proven. If timeout or cancellation occurs and work has not stopped after the
fixed `terminationGraceMs: 1000` policy snapshot, it returns
`uncertain { trigger, stage, evidence }`. That is not a terminal result and
does not authorize retry or release an in-use handle. The package supervises the
late settlement in process; a later `reconcileAttempt` becomes terminal if it
settles, otherwise a restart/eviction is `unknown`. A retryable terminal failure
and the manifest retry policy are returned to the durable host; this package
never sleeps for backoff or starts another attempt.

`cancelAttempt` and `reconcileAttempt` only return a terminal result when it is
known. They return the same `uncertain` observation while the local supervisor
owns an unresolved timed-out/cancelled attempt, and `unknown` for active or
crash-uncertain work. Neither turns uncertainty into false `notFound` or
success.

Every terminal result has a required, portable `terminalEvent`; its type is
coupled to the result branch rather than being a broad event-emission union:

- `succeeded` → `ScriptSucceededTerminalEventEmission`, containing
  `revo.script.succeeded` with its evidence count;
- `failed` → `ScriptFailedTerminalEventEmission`, containing
  `revo.script.failed` with the failure code, stage, and retryability;
- `cancelled` → `ScriptCancelledTerminalEventEmission`, containing
  `revo.script.cancelled` with lifecycle details; and
- `timedOut` → `ScriptTimedOutTerminalEventEmission`, containing
  `revo.script.timed_out` with the timeout failure code.

An individual terminal result cannot contain a terminal emission from another
branch, a started event, or a custom event.

The durable host persists and publishes this pair atomically. `uncertain` has
no `terminalEvent`; a later terminal reconciliation returns the same sealed
terminal result.

## Attempt observation state

The facade keeps process-local observation state for accepted physical attempt
identities. It is not a durable execution ledger.

- A duplicate `(executionId, attemptId)` is rejected before host acquisition or
  handler dispatch.
- At most 1,024 active or uncertain identities are retained. Admission above
  that bound returns the retryable `revo.script.execution.capacity` fault.
- At most 1,024 terminal results are retained in first-in-first-out order. An
  evicted terminal identity has no local proof and therefore reconciles as
  `unknown`.
- `cancelAttempt` asks an active attempt to stop, but returns `unknown` until
  terminal evidence exists. A terminal identity returns `alreadyTerminal`; an
  unresolved supervised identity returns its `uncertain` result.
- `reconcileAttempt` returns `terminal`, the current `uncertain` result, or
  `unknown`. The public schema also reserves `notFound` for a future
  implementation that can prove no external dispatch; the current in-process
  facade has no such durable proof and returns `unknown` instead.

The operation `executionId` and physical `attemptId` are both required because
one operation can have several separately persisted physical attempts. The
library never chooses the next attempt or delay; the durable host makes that
decision from the returned retry policy and terminal result.

## Events and failures

An attempt receives its own live event sink. It receives only
`revo.script.started` and manifest-declared custom events in one serial positive
ordinal lane. Before a custom event reaches the sink, the package verifies its
name, applies redaction, deep-owns JSON and enforces the 65,536-byte bound.
Invalid events do not reach the sink and latch a non-retryable handler failure
even if handler code catches the rejection. Terminal lifecycle events are sealed
into a proven result after that live lane settles; they are never sent to the
sink.

Failures are portable, redacted values. Cleanup failure wins over sink failure;
sink failure wins over timeout, cancellation, handler/provider failure or
success. Earlier outcomes are retained as structured causes, never as raw
exception text. Secrets, absolute paths and provider responses never appear in
prepared bindings, events, results or failures.

## Authoring and manifests

`defineScript` has one handler context: `executionId`, `attemptOrdinal`, bounded
resources, `signal` and custom-event `emit`. It has no second idempotency key or
conditional handler families. A manifest uses `operations` and `impactClass`.

`retry` remains a declarative policy snapshot. The durable host may create a
next attempt only when the policy allows it, the returned failure is retryable,
the ordinal remains below the cap and idempotency is not `not-retryable`.
