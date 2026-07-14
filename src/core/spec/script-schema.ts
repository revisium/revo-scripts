export interface ScriptSchemaIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export type ScriptSchemaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ScriptSchemaIssue[] };

export interface ScriptSchema<T> {
  readonly id: string;
  validate(value: unknown): Promise<ScriptSchemaResult<T>>;
  toJsonSchema(): Readonly<Record<string, unknown>>;
}
