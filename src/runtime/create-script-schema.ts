import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

import type { ScriptSchema, ScriptSchemaIssue } from '../spec/script-schema.js';

type SupportedStandardSchema = StandardSchemaV1 & StandardJSONSchemaV1;

export interface CreateScriptSchemaOptions<TSchema extends SupportedStandardSchema> {
  readonly id: string;
  readonly schema: TSchema;
  readonly jsonSchema: 'input' | 'output';
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

export const createScriptSchema = <TSchema extends SupportedStandardSchema>(
  options: CreateScriptSchemaOptions<TSchema>,
): ScriptSchema<StandardSchemaV1.InferOutput<TSchema>> => {
  const standard = options.schema['~standard'];

  return Object.freeze({
    id: options.id,
    validate: async (value: unknown) => {
      const result = await standard.validate(value);

      if (result.issues !== undefined) {
        return {
          ok: false as const,
          issues: result.issues.map(normalizeIssue),
        };
      }

      return { ok: true as const, value: result.value };
    },
    toJsonSchema: () => {
      const converter = standard.jsonSchema[options.jsonSchema];
      const schema = converter({ target: 'draft-2020-12' });

      return Object.freeze({
        ...schema,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: options.id,
      });
    },
  });
};
