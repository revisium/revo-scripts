import type { StandardScriptSchemaOptions } from './standard-script-schema-options.js';
import type { SupportedStandardSchema } from './supported-standard-schema.js';

export type CreateScriptSchemaOptions<TSchema extends SupportedStandardSchema> =
  StandardScriptSchemaOptions<TSchema>;
