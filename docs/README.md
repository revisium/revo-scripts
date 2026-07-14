# Documentation

This directory owns the package architecture and exact target contracts.

## Current state

The repository currently ships only its package toolchain and quality gates. Documents marked `Draft` describe the
target package contract; they do not claim that a runtime API is already available.

## Architecture

- [ADR-0001: Script SDK and runtime boundary](./adr/0001-script-sdk-and-runtime-boundary.md) explains why the package
  owns a public script SDK, one-script runtime, and bounded built-ins.
- [Script runtime v1](./specs/script-runtime-v1.spec.md) defines the exact target manifest, definition, registry,
  execution, error, event, and extension contracts.
- [Testing](./testing.md) defines test-layer ownership and the required proof for runtime and script changes.

Repository layout, source-of-truth order, and dependency direction are documented in
[REPOSITORY.md](../REPOSITORY.md). Executable commands and gate status are documented in
[VERIFICATION.md](../VERIFICATION.md).
