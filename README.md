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

`@revisium/revo-scripts` will provide independently versioned script definitions and the infrastructure needed to execute one bounded script. This initial revision intentionally contains only the package toolchain and quality gates.

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
