export type ScriptErrorCode =
  | `revo.script.validation.${string}`
  | `revo.script.permission.${string}`
  | `revo.script.timeout.${string}`
  | `revo.script.execution.${string}`
  | `revo.script.provider.${string}`
  | `revo.script.idempotency.${string}`;
