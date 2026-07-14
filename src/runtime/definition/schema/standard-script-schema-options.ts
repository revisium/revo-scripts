import type { SupportedStandardSchema } from './supported-standard-schema.js';

export interface StandardScriptSchemaOptions<TSchema extends SupportedStandardSchema> {
  readonly id: string;
  readonly schema: TSchema;
  readonly jsonSchema: 'input' | 'output';
}
