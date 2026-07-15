# Documentation

This directory owns the package architecture and exact target contracts.

## Current state

The repository contains the one-script runtime, `createRevoScripts` facade, public testing mechanics, bounded Git and
GitHub operations, and package-owned Node Git and Fetch GitHub providers. The host supplies stable infrastructure ports
and opaque bindings; it does not construct per-script clients. The npm package remains unpublished. Documents marked
`Draft` still include pre-publication decisions such as source retention for simultaneous script versions.

## Architecture

- [ADR-0001: Script SDK and runtime boundary](./adr/0001-script-sdk-and-runtime-boundary.md) explains why the package
  owns a public script SDK, one-script runtime, bounded built-ins, and their production provider adapters while keeping
  runtime, host ports, application composition, provider infrastructure, and concrete scripts in separate ownership
  areas.
- [Script runtime v1](./specs/script-runtime-v1.spec.md) defines the exact target manifest, definition, registry,
  consumer facade, host binding, provider, execution, versioning, error, event, and extension contracts.
- [Testing](./testing.md) defines test-layer ownership and the required proof for runtime, provider, consumer, and
  script changes.

Repository layout, source-of-truth order, and dependency direction are documented in
[REPOSITORY.md](../REPOSITORY.md). Executable commands and gate status are documented in
[VERIFICATION.md](../VERIFICATION.md).
