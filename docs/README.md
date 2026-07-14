# Documentation

This directory owns the package architecture and exact target contracts.

## Current state

The repository contains the one-script runtime, initial `createRevoScripts` facade, public testing mechanics, and the
read-only `script:git/status` vertical proof backed by the package-owned Node Git provider. The host supplies a stable
process executor and resolves an opaque workspace id; it does not construct a per-script client. The npm package
remains unpublished. Documents marked `Draft` include target contract work beyond the implemented and tested surface,
including coordinate/credential completion and build-generated exact implementation identity.

## Architecture

- [ADR-0001: Script SDK and runtime boundary](./adr/0001-script-sdk-and-runtime-boundary.md) explains why the package
  owns a public script SDK, one-script runtime, bounded built-ins, and their production provider adapters while keeping
  `core`, provider infrastructure, and concrete scripts in separate ownership areas.
- [Script runtime v1](./specs/script-runtime-v1.spec.md) defines the exact target manifest, definition, registry,
  consumer facade, host binding, provider, execution, versioning, error, event, and extension contracts.
- [Testing](./testing.md) defines test-layer ownership and the required proof for runtime, provider, consumer, and
  script changes.

Repository layout, source-of-truth order, and dependency direction are documented in
[REPOSITORY.md](../REPOSITORY.md). Executable commands and gate status are documented in
[VERIFICATION.md](../VERIFICATION.md).
