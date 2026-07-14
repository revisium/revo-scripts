export interface ScriptSchemaIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}
