import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { ScriptSchema } from '../../spec/schema/index.js';
import type { CreateScriptSchemaOptions } from './create-script-schema-options.js';
import { StandardScriptSchema } from './standard-script-schema.js';
import type { SupportedStandardSchema } from './supported-standard-schema.js';

export const createScriptSchema = <TSchema extends SupportedStandardSchema>(
  options: CreateScriptSchemaOptions<TSchema>,
): ScriptSchema<StandardSchemaV1.InferOutput<TSchema>> => new StandardScriptSchema(options);
