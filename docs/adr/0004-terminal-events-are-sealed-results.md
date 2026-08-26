# ADR-0004: Terminal events are sealed results

Status: Accepted

Amends ADR-0002 and ADR-0003.

The live per-attempt `EventSink` accepts only `revo.script.started` and
manifest-declared custom events. It never receives `succeeded`, `failed`,
`cancelled`, or `timed_out`. A sink cannot retract an event after accepting it,
so publishing a terminal event before the final outcome is known could persist a
false claim after a deadline or cancellation.

Every proven terminal `ScriptAttemptResult` instead includes a required,
result-coupled terminal emission. The four exact pairings are:

- `succeeded` → `terminalEvent: ScriptSucceededTerminalEventEmission`, carrying
  `revo.script.succeeded` and the evidence count;
- `failed` → `terminalEvent: ScriptFailedTerminalEventEmission`, carrying
  `revo.script.failed` with the failure code, stage, and retryability;
- `cancelled` → `terminalEvent: ScriptCancelledTerminalEventEmission`, carrying
  `revo.script.cancelled` with lifecycle details; and
- `timedOut` → `terminalEvent: ScriptTimedOutTerminalEventEmission`, carrying
  `revo.script.timed_out` with the timeout failure code.

No broad terminal-emission type is accepted for an individual result branch.
The event receives the next shared attempt ordinal, but sealing it is pure
package work and performs no sink I/O.

An `uncertain` result has no terminal event. If supervised work settles later,
`reconcileAttempt` returns the same proven terminal result, including its sealed
event. It still does not send a late event to the former sink. The durable host
must persist and publish the terminal result and its `terminalEvent` atomically.
This is the RN1 handoff: `revo-run`/its host owns durable event publication;
`revo-scripts` only returns portable terminal evidence.

Ordinals remain one sequence for one attempt. Started and custom emissions use
the live sink; the sealed terminal event uses the next ordinal in the returned
result. A rejected or unsettled live custom emission may therefore leave an
ordinal gap before a later sealed event.
