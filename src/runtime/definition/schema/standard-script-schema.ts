import type { StandardSchemaV1 } from '@standard-schema/spec';

import type {
  ScriptSchema,
  ScriptSchemaIssue,
  ScriptSchemaResult,
} from '../../spec/schema/index.js';
import type { StandardScriptSchemaOptions } from './standard-script-schema-options.js';
import type { SupportedStandardSchema } from './supported-standard-schema.js';

export class StandardScriptSchema<TSchema extends SupportedStandardSchema> implements ScriptSchema<
  StandardSchemaV1.InferOutput<TSchema>
> {
  readonly id: string;
  private readonly standard: TSchema['~standard'];
  private readonly jsonSchema: 'input' | 'output';

  constructor(options: StandardScriptSchemaOptions<TSchema>) {
    this.id = options.id;
    this.standard = options.schema['~standard'];
    this.jsonSchema = options.jsonSchema;
  }

  async validate(
    value: unknown,
  ): Promise<ScriptSchemaResult<StandardSchemaV1.InferOutput<TSchema>>> {
    const result = await this.standard.validate(value);

    if (result.issues !== undefined) {
      return {
        ok: false,
        issues: result.issues.map(normalizeIssue),
      };
    }

    return { ok: true, value: result.value };
  }

  toJsonSchema(): Readonly<Record<string, unknown>> {
    const converter = this.standard.jsonSchema[this.jsonSchema];
    const schema = converter({ target: 'draft-2020-12' });

    return {
      ...schema,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: this.id,
    };
  }
}

const normalizePathKey = (key: PropertyKey): string | number =>
  typeof key === 'number' ? key : String(key);

const normalizePathSegment = (
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number => {
  if (typeof segment === 'object') {
    return normalizePathKey(segment.key);
  }

  return normalizePathKey(segment);
};

const normalizeIssue = (issue: StandardSchemaV1.Issue): ScriptSchemaIssue => ({
  message: issue.message,
  path: issue.path?.map(normalizePathSegment) ?? [],
});
