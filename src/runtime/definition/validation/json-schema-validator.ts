import { Ajv2020 } from 'ajv/dist/2020.js';

import type { ScriptSchema } from '../../spec/schema/index.js';
import type { ManifestValidationIssue } from './manifest/manifest-validation-issue.js';
import type { ValidatedJsonSchema } from './validated-json-schema.js';

const draft202012 = 'https://json-schema.org/draft/2020-12/schema';
const schemaMapKeywords = new Set(['$defs', 'dependentSchemas', 'patternProperties', 'properties']);
const schemaArrayKeywords = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const schemaValueKeywords = new Set([
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedProperties',
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateObjectClosure = (
  schema: Readonly<Record<string, unknown>>,
  path: string,
): readonly ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = [];

  if (schema.type === 'object' && schema.additionalProperties !== false) {
    issues.push({
      path: `${path}/additionalProperties`,
      message: 'Object schemas must explicitly reject unknown properties.',
    });
  }

  Object.entries(schema).forEach(([key, value]) => {
    if (schemaArrayKeywords.has(key) && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isRecord(item)) {
          issues.push(...validateObjectClosure(item, `${path}/${key}/${index}`));
        }
      });
      return;
    }

    if (schemaMapKeywords.has(key) && isRecord(value)) {
      Object.entries(value).forEach(([name, nestedSchema]) => {
        if (isRecord(nestedSchema)) {
          issues.push(...validateObjectClosure(nestedSchema, `${path}/${key}/${name}`));
        }
      });
      return;
    }

    if (schemaValueKeywords.has(key) && isRecord(value)) {
      issues.push(...validateObjectClosure(value, `${path}/${key}`));
    }
  });

  return issues;
};

const validateCompilation = (
  schema: Readonly<Record<string, unknown>>,
  path: string,
): readonly ManifestValidationIssue[] => {
  try {
    const validator = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    validator.compile(schema);
    return [];
  } catch {
    return [
      {
        path,
        message: 'JSON Schema must compile under strict Draft 2020-12 validation.',
      },
    ];
  }
};

export const validateJsonSchema = <T>(
  schema: ScriptSchema<T>,
  expectedId: string,
  path: '/inputSchema' | '/resultSchema',
): ValidatedJsonSchema => {
  const jsonSchema = schema.toJsonSchema();
  const issues: ManifestValidationIssue[] = [];
  const label = path === '/inputSchema' ? 'Input' : 'Result';
  const manifestField = path === '/inputSchema' ? 'inputSchemaId' : 'resultSchemaId';

  if (schema.id !== expectedId) {
    issues.push({
      path: `${path}/id`,
      message: `${label} schema id must match manifest.${manifestField}.`,
    });
  }

  if (jsonSchema.$schema !== draft202012) {
    issues.push({
      path: `${path}/jsonSchema/$schema`,
      message: 'JSON Schema must target Draft 2020-12.',
    });
  }

  if (jsonSchema.$id !== expectedId) {
    issues.push({
      path: `${path}/jsonSchema/$id`,
      message: `JSON Schema $id must match manifest.${manifestField}.`,
    });
  }

  issues.push(
    ...validateObjectClosure(jsonSchema, `${path}/jsonSchema`),
    ...validateCompilation(jsonSchema, `${path}/jsonSchema`),
  );

  return { jsonSchema, issues };
};
