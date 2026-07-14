<div align="center">

# @revisium/revo-scripts

**A dedicated home for bounded, versioned Revo scripts.**

[![CI](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> [!IMPORTANT]
> The repository is in its bootstrap phase. The npm package has not been published and no runtime API is available yet.

## About

`@revisium/revo-scripts` will be the SDK and runtime for defining, validating, registering, testing, and executing bounded Revo scripts. It will provide independently versioned built-in scripts and let consumers add their own scripts through the same public contracts.

This initial revision intentionally contains only the package toolchain and quality gates. The runtime API described below is the planned package boundary and is not available yet.

## Responsibilities

The package owns:

- versioned script definitions and serializable manifests;
- input and output schemas, typed results, and structured failures;
- `defineScript`, manifest validation, and an explicitly populated sealed registry;
- execution of one bounded script through injected typed ports;
- timeout, retry, idempotency, permission, event, and redaction contracts;
- reusable contract tests, fixtures, and fake ports for custom scripts;
- bounded built-in Git and GitHub scripts.

Utilities belong in this package only when they directly support script definition, validation, execution, or testing. The package is not a home for general Revo helpers.

## Custom scripts

Consumers will be able to implement custom Revo scripts without changing this repository:

1. define a stable script identity, versioned manifest, schemas, permissions, resources, effects, and execution policies;
2. implement one bounded operation against the declared typed ports;
3. verify the definition and behavior with the exported contract test kit;
4. explicitly register the trusted definition in the host application before the registry is sealed;
5. execute it through the same runtime contract as a built-in script.

The runtime will not scan the filesystem, discover npm packages automatically, or load scripts from mutable configuration. The host application decides which trusted definitions are installed and registered.

## Non-goals

This package does not own:

- pipeline routing, cursor state, choices, waits, or orchestration;
- human approval gates;
- workspace or worktree allocation and cleanup;
- database, DBOS, Prisma, or NestJS integration;
- credential storage or resolution;
- artifact persistence or pipeline provenance;
- global mutable logging or unrestricted shell, filesystem, network, or provider access.

## Planned package entrypoints

| Entrypoint                       | Responsibility                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `@revisium/revo-scripts`         | Curated stable package API                                         |
| `@revisium/revo-scripts/spec`    | Definitions, manifests, schemas, results, and errors               |
| `@revisium/revo-scripts/runtime` | Definition, registry, validation, events, redaction, and execution |
| `@revisium/revo-scripts/git`     | Bounded Git contracts and built-in scripts                         |
| `@revisium/revo-scripts/github`  | Bounded GitHub contracts and built-in scripts                      |
| `@revisium/revo-scripts/testing` | Contract suite, fixtures, and fake ports                           |

The intended lifecycle is:

```text
define -> validate -> register -> seal -> execute one script -> typed result
```

## Architecture

- [Repository map](REPOSITORY.md) defines ownership, source-of-truth order, layout, and dependency direction.
- [ADR-0001](docs/adr/0001-script-sdk-and-runtime-boundary.md) records the proposed SDK and runtime boundary.
- [Script runtime v1](docs/specs/script-runtime-v1.spec.md) defines the exact target package contract.
- [Testing](docs/testing.md) defines test-layer ownership and per-script proof requirements.

Documents marked `Draft` describe the proposed target and do not make an API available. The first implementation
slice will prove the runtime with the read-only `script:git/status` built-in before any mutation operation is added.

## Requirements

- Node.js 24 (`>=24.11.1 <25`)
- pnpm 11.13.0 through Corepack
- Docker only for the local SonarCloud parity check

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Useful commands:

| Command               | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `pnpm build`          | Build ESM JavaScript and TypeScript declarations with TypeScript 7 |
| `pnpm format`         | Format supported repository files with Oxfmt                       |
| `pnpm format:check`   | Verify formatting without writing files                            |
| `pnpm lint`           | Run type-aware Oxlint and TypeScript diagnostics                   |
| `pnpm test`           | Run the Node.js test suite                                         |
| `pnpm test:cov`       | Run tests and write LCOV coverage                                  |
| `pnpm verify`         | Run the complete local CI gate                                     |
| `pnpm ci:local:sonar` | Run verification, Sonar analysis, and open-issue inspection        |

## SonarCloud

Copy `.env.sonar.example` to an ignored local file and provide a Sonar token:

```bash
cp .env.sonar.example .env.sonar
pnpm ci:local:sonar
```

An existing environment file can be reused without copying secrets:

```bash
SONAR_ENV_FILE=/absolute/path/to/.env.sonar pnpm ci:local:sonar
```

CI runs the same verification gate before Sonar analysis. Pull requests additionally wait for the Quality Gate and fail when open Sonar issues remain.

## Package contract

The package is ESM-only, uses explicit exports, emits declarations, and ships only `dist`, `README.md`, `LICENSE`, and package metadata. Package contents and type declarations are validated during `pnpm verify`.

## License

[MIT](LICENSE) © Revisium
