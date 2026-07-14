import type { ScriptSchemaResult } from './script-schema-result.js';

export interface ScriptSchema<T> {
  readonly id: string;
  validate(value: unknown): Promise<ScriptSchemaResult<T>>;
  toJsonSchema(): Readonly<Record<string, unknown>>;
}
