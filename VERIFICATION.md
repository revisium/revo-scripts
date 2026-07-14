# Verification

## Root gate

Run from the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

`pnpm verify` checks Oxfmt formatting, runs strict TypeScript 7 typechecking and type-aware Oxlint with zero warnings, tests, LCOV coverage, the declaration build, `publint`, `@arethetypeswrong/cli`, and an npm package-content dry run.

## Sonar parity

Provide `SONAR_TOKEN` through `.env.sonar`, `SONAR_ENV_FILE`, or the environment, then run:

```bash
corepack pnpm ci:local:sonar
```

This reruns the root gate, uploads analysis, waits for the Quality Gate, and fails when open Sonar issues remain in the current PR or branch.

## Before commit

```bash
git diff --check
bash -n scripts/*.sh
corepack pnpm verify
```
