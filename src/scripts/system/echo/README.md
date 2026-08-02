# System echo

## Identity

| Field                                      | Value                |
| ------------------------------------------ | -------------------- |
| Script id                                  | `script:system/echo` |
| Revision                                   | `1`                  |
| Effect class                               | `pure`               |
| Effects, permissions, resources, providers | none                 |
| Idempotency                                | `read-only`          |

## Operation

Accepts exactly `{ message: string }` with at most 65,536 characters and returns the same message in a readonly TypeScript result contract. It performs no external effect and never resolves workspaces or credentials. The `(script id, revision)` contract is immutable; an observable change requires a new integer revision, with no range, latest, tag, or fallback resolution.

## Files and dependencies

`types.ts` owns JSON types, `schemas.ts` owns validation, `manifest.ts` owns policy, `system-echo.handler.ts` owns the stateless operation, and `script.ts` composes the definition. The operation imports no host, provider, or application modules.

## Failure and event contract

Input and result schema validation enforce the 65,536-character message limit. The script declares no custom events, evidence, or redaction paths.

## Verification

See `test/contract/system/echo.test.ts` and the repository `pnpm verify` gate.
