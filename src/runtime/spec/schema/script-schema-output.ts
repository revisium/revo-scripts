import type { DeepReadonly } from './deep-readonly.js';
import type { ScriptSchema } from './script-schema.js';

export type ScriptSchemaOutput<TSchema extends ScriptSchema<unknown>> =
  TSchema extends ScriptSchema<infer Output> ? DeepReadonly<Output> : never;
