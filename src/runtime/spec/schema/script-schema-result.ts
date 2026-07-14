import type { ScriptSchemaIssue } from './script-schema-issue.js';

export type ScriptSchemaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ScriptSchemaIssue[] };
