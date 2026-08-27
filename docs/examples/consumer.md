# Consumer example

The consumer supplies opaque profile assignments and trusted host resolvers. It
does not build provider clients, read a secret, schedule retries, or select a
script implementation.

```ts
const scripts = createRevoScripts({
  host: { resources, workspaces, credentials, clock },
});

const binding = await scripts.prepareBinding(
  {
    script: { id: 'script:git/status', version: 1 },
    resources: {
      repository: {
        resourceRef: 'resource:repository-123',
        workspaceRef: 'workspace:456',
      },
    },
    credentials: {},
  },
  { signal },
);

const result = await scripts.executeAttempt(
  {
    executionId: 'run-42:status',
    attemptId: 'run-42:status:1',
    attemptOrdinal: 1,
    script: binding.script,
    binding,
    input: statusInput,
  },
  { signal, events: attemptEventSink },
);
```

The prepared binding is the durable admission snapshot. `executeAttempt` makes
one physical call and returns a structured outcome. On a retryable failure, the
consumer uses the returned policy and result to decide whether to persist and
start a new attempt with the same `executionId` and a new `attemptId`.

`attemptEventSink` is scoped to the physical attempt. It receives redacted,
bounded `revo.script.started` and declared custom events in one ordinal
sequence. A proven terminal result includes `terminalEvent`; the consumer
persists and publishes the terminal result/event pair atomically instead of
expecting a terminal event from this sink.
