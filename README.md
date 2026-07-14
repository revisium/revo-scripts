<div align="center">

# @revisium/revo-scripts

**A dedicated home for bounded, versioned Revo scripts.**

[![CI](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml/badge.svg)](https://github.com/revisium/revo-scripts/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revo-scripts&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revo-scripts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

> [!IMPORTANT]
> The runtime foundation is implemented in this repository, but the npm package has not been published yet.

## About

`@revisium/revo-scripts` is the SDK and runtime for defining, validating, registering, testing, and executing one bounded Revo script. It provides independently versioned built-ins and lets consumers add trusted custom scripts through the same public contracts.

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

Consumers can implement custom Revo scripts without changing this repository:

1. define a stable script identity, versioned manifest, schemas, permissions, resources, effects, and execution policies;
2. implement one bounded operation against the declared typed ports;
3. verify the definition and behavior with the exported contract test kit;
4. explicitly register the trusted definition in the host application before the registry is sealed;
5. execute it through the same runtime contract as a built-in.

The runtime does not scan the filesystem, discover npm packages automatically, or load scripts from mutable configuration. The host application decides which trusted definitions are installed and registered.

## Non-goals

This package does not own:

- pipeline routing, cursor state, choices, waits, or orchestration;
- human approval gates;
- workspace or worktree allocation and cleanup;
- database, DBOS, Prisma, or NestJS integration;
- credential storage or resolution;
- artifact persistence or pipeline provenance;
- global mutable logging or unrestricted shell, filesystem, network, or provider access.

## Package entrypoints

| Entrypoint                       | Responsibility                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `@revisium/revo-scripts`         | Curated stable package API                                         |
| `@revisium/revo-scripts/spec`    | Definitions, manifests, schemas, results, and errors               |
| `@revisium/revo-scripts/runtime` | Definition, registry, validation, events, redaction, and execution |
| `@revisium/revo-scripts/git`     | Bounded Git contracts and built-in scripts                         |
| `@revisium/revo-scripts/testing` | Contract suite, fixtures, and fake ports                           |

The GitHub entrypoint is intentionally absent until its first bounded implementation exists.

The intended lifecycle is:

```text
define -> validate -> register -> seal -> execute one script -> typed result
```

## Architecture

- [Repository map](REPOSITORY.md) defines ownership, source-of-truth order, layout, and dependency direction.
- [ADR-0001](docs/adr/0001-script-sdk-and-runtime-boundary.md) records the proposed SDK and runtime boundary.
- [Script runtime v1](docs/specs/script-runtime-v1.spec.md) defines the exact target package contract.
- [Testing](docs/testing.md) defines test-layer ownership and per-script proof requirements.

The current vertical proof is the read-only `script:git/status` built-in. It receives a prepared repository
capability, returns a bounded status summary, and performs no process execution or mutation itself. Documents marked
`Draft` continue to describe contract work that has not yet been accepted as stable API.

## Schema strategy

The public `ScriptSchema` contract is validation-library-neutral. `createScriptSchema` accepts Standard Schema and
Standard JSON Schema compatible validators; built-ins currently use Zod for type inference. `defineScript` compiles
the resulting Draft 2020-12 JSON Schema with Ajv in strict mode before a definition can enter the registry.

## Runtime example

```ts
import { createScriptRegistry, executeScript } from '@revisium/revo-scripts';
import { gitStatusScript } from '@revisium/revo-scripts/git';
import { RecordingEventSink } from '@revisium/revo-scripts/testing';

const registry = createScriptRegistry();
const script = registry.register(gitStatusScript);
registry.seal();

const result = await executeScript(registry, script, {
  executionId: 'status-1',
  input: {},
  resources: {
    repository: {
      name: 'repository',
      kind: 'repository',
      access: 'read',
      grant: { permissions: ['git.status.read'], effects: ['git.read'] },
      capabilities: {
        readStatus: async () => ({
          branch: 'master',
          headSha: '0123456789abcdef0123456789abcdef01234567',
          detached: false,
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
          conflictedCount: 0,
        }),
      },
    },
  },
  eventSink: new RecordingEventSink(),
});
```

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

| Command                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `pnpm build`               | Build ESM JavaScript and TypeScript declarations with TypeScript 7 |
| `pnpm format`              | Format supported repository files with Oxfmt                       |
| `pnpm format:check`        | Verify formatting without writing files                            |
| `pnpm lint`                | Run type-aware Oxlint and TypeScript diagnostics                   |
| `pnpm test`                | Run focused Vitest unit, contract, and package suites              |
| `pnpm test:cov`            | Run tests and write LCOV coverage                                  |
| `pnpm verify:architecture` | Enforce the acyclic source dependency DAG with Oxlint              |
| `pnpm verify`              | Run the complete local CI gate                                     |
| `pnpm ci:local:sonar`      | Run verification, Sonar analysis, and open-issue inspection        |

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
