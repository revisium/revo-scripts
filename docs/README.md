# Documentation

This directory owns the package architecture and exact target contracts.

## Current state

The repository contains the one-script runtime, `createRevoScripts` facade, public testing mechanics, bounded Git and
GitHub operations, and package-owned Node Git and Fetch GitHub providers. The host supplies stable infrastructure ports
and opaque bindings; it does not construct per-script clients. The npm package remains unpublished. Documents marked
`Draft` still include pre-publication decisions such as source retention for simultaneous script revisions.

## Architecture

The [expanded consumer example](examples/consumer.md) contains the larger host-binding, operation, result, recovery,
artifact, approval, and event examples that are intentionally omitted from the root README.

- [ADR-0001: Script SDK and runtime boundary](./adr/0001-script-sdk-and-runtime-boundary.md) explains why the package
  owns a public script SDK, one-script runtime, bounded built-ins, and their production provider adapters while keeping
  runtime, host ports, application composition, provider infrastructure, and concrete scripts in separate ownership
  areas.
- [ADR-0002: One attempt and durable-host boundary](./adr/0002-one-attempt-durable-host-boundary.md) defines the
  prepare/attempt/cancel/reconcile cutover and durable retry ownership.
- [ADR-0003: Uncertain-attempt supervision](./adr/0003-uncertain-attempt-supervision.md) defines the fixed grace,
  bounded local state, duplicate identity rule, late reconciliation, and no-event uncertain outcome.
- [ADR-0004: Terminal events are sealed results](./adr/0004-terminal-events-are-sealed-results.md) defines the
  atomic terminal result/event handoff to the durable host and keeps terminal names out of the live event sink.
- [Script runtime v1](./specs/script-runtime-v1.spec.md) defines the exact target manifest, definition, registry,
  consumer facade, host binding, internal provider selection, execution, integer revision, error, event, and extension
  contracts.
- [Testing](./testing.md) defines test-layer ownership and the required proof for runtime, provider, consumer, and
  script changes.
- [Release train](./release-train.md) defines package SemVer, shared release automation, npm publication, and
  post-publication consumer verification.

Repository layout, source-of-truth order, and dependency direction are documented in
[REPOSITORY.md](../REPOSITORY.md). Executable commands and gate status are documented in
[VERIFICATION.md](../VERIFICATION.md).
