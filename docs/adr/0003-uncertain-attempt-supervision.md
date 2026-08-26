# ADR-0003: Uncertain-attempt supervision

Status: Accepted

Amends ADR-0002.

Timeout and cancellation are requests to stop work, not proof that a handler,
provider, cleanup operation, or event sink has stopped. Returning `timedOut` or
`cancelled` while a non-cooperative handler retains a live resource would make a
false durable claim and could dispose that resource while it is in use.

`executeAttempt` therefore returns a non-terminal result when it cannot prove
settlement after the fixed `terminationGraceMs: 1000` policy bound:

```ts
{
  kind: 'uncertain',
  trigger: 'timeout' | 'cancellation',
  stage: 'acquire' | 'handler' | 'validation' | 'cleanup' | 'event_sink',
  evidence: [],
}
```

No terminal lifecycle event is emitted for that result and the package does not
release a handle still owned by outstanding work. The in-process supervisor
retains the exact attempt identity, performs cleanup after settlement, and then
lets `reconcileAttempt` return the late terminal result. While unresolved,
`cancelAttempt` and `reconcileAttempt` return the same `uncertain` observation.
On restart or bounded-state eviction there is no durable proof, so both retain
the conservative `unknown` result.

The grace period starts once from the first timeout or cancellation and is never
reset. The process retains at most 1,024 open (active or uncertain) identities
and 1,024 terminal results in FIFO order. A duplicate identity is rejected
before any external work. `uncertain` is deliberately not an event. A
subsequent proven terminal result contains its sealed terminal lifecycle
evidence as specified by ADR-0004; it does not publish a late event to the
previous live sink.
