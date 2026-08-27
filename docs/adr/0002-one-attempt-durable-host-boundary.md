# ADR-0002: One attempt and durable-host boundary

Status: Accepted

`@revisium/revo-scripts` owns script definitions, provider selection, permission
validation, one physical handler/provider attempt, and safe disposal of acquired
handles. It does not own durable retry scheduling, pipeline transitions, or run
storage.

The root facade has four operations:

```text
prepareBinding → executeAttempt → cancelAttempt / reconcileAttempt
```

`prepareBinding` resolves only trusted metadata through `inspect` ports and
returns a portable `PreparedScriptBinding`. It contains exact script and provider
identity, validated resource descriptors, credential descriptors, and retry
policy. It never contains a secret, absolute workspace path, live client,
AbortSignal, or disposer.

`executeAttempt` accepts one stable `executionId` and one physical `attemptId`.
The former is the only operation/idempotency identity exposed to script authors;
the latter lets the durable host address one relay attempt. The package invokes a
handler at most once per call. A retryable failure is returned to the caller with
the declarative retry policy snapshot; this package never sleeps or creates a
second attempt.

Workspace and credential handles are acquired immediately before provider work
and disposed on every completed path. `cancelAttempt` and `reconcileAttempt`
never claim `notFound` or a terminal outcome after process-local uncertainty;
they return `unknown` until proof exists. See ADR-0003 for the later, explicit
uncertain-attempt refinement.

Events are supplied per attempt. The package validates, redacts, bounds and
serializes lifecycle and allowed custom events before assigning their shared
ordinal. A durable sink failure is a terminal execution failure and does not
trigger a recursive terminal event.

ADR-0004 supersedes the terminal-event delivery detail: terminal lifecycle
evidence is sealed into a proven result for durable-host publication, not sent
to the live sink.

The permission vocabulary is `operations` and `impactClass`. These are script
authorization terms, independent from pipeline source-language constructs.
