import { Ajv2020 } from 'ajv/dist/2020.js';

import type { ScriptDefinitionInput } from '../spec/script-definition.js';
import { ScriptFault } from '../spec/script-errors.js';
import type { ScriptResourceMap } from '../spec/script-resources.js';
import type { ScriptSchema } from '../spec/script-schema.js';
import type { ManifestValidationIssue } from './validate-manifest.js';
import { codePointLength, semanticVersionPattern } from './validation-rules.js';

const draft202012 = 'https://json-schema.org/draft/2020-12/schema';
const implementationIdPattern =
  /^(?:@[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+|[a-z][a-z0-9-]*(?:[./][a-z][a-z0-9-]*)+)$/;

export interface ValidatedDefinitionSchemas {
  readonly input: Readonly<Record<string, unknown>>;
  readonly result: Readonly<Record<string, unknown>>;
}

const validateObjectClosure = (
  schema: Readonly<Record<string, unknown>>,
  path: string,
): readonly ManifestValidationIssue[] => {
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    return [
      {
        path: `${path}/additionalProperties`,
        message: 'Object schemas must explicitly reject unknown properties.',
      },
    ];
  }

  return [];
};

const validateJsonSchemaCompilation = (
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

const validateSchema = <T>(
  schema: ScriptSchema<T>,
  expectedId: string,
  path: string,
): Readonly<{
  jsonSchema: Readonly<Record<string, unknown>>;
  issues: readonly ManifestValidationIssue[];
}> => {
  const jsonSchema = schema.toJsonSchema();
  const issues: ManifestValidationIssue[] = [];

  if (schema.id !== expectedId) {
    issues.push({
      path: `${path}/id`,
      message: `${path === '/inputSchema' ? 'Input' : 'Result'} schema id must match manifest.${
        path === '/inputSchema' ? 'inputSchemaId' : 'resultSchemaId'
      }.`,
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
      message: `JSON Schema $id must match manifest.${
        path === '/inputSchema' ? 'inputSchemaId' : 'resultSchemaId'
      }.`,
    });
  }

  issues.push(...validateObjectClosure(jsonSchema, `${path}/jsonSchema`));
  issues.push(...validateJsonSchemaCompilation(jsonSchema, `${path}/jsonSchema`));

  return { jsonSchema, issues };
};

const validateImplementation = (
  id: string,
  version: string,
): readonly ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = [];

  if (codePointLength(id) > 256 || !implementationIdPattern.test(id)) {
    issues.push({
      path: '/implementation/id',
      message: 'Implementation id must be a stable namespaced identifier.',
    });
  }

  if (codePointLength(version) > 128 || !semanticVersionPattern.test(version)) {
    issues.push({
      path: '/implementation/version',
      message: 'Implementation version must be an exact semantic version.',
    });
  }

  return issues;
};

export const validateDefinition = <I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
): ValidatedDefinitionSchemas => {
  const inputSchema = validateSchema(
    input.inputSchema,
    input.manifest.inputSchemaId,
    '/inputSchema',
  );
  const resultSchema = validateSchema(
    input.resultSchema,
    input.manifest.resultSchemaId,
    '/resultSchema',
  );
  const issues = [
    ...inputSchema.issues,
    ...resultSchema.issues,
    ...validateImplementation(input.implementation.id, input.implementation.version),
  ];

  if (issues.length > 0) {
    throw new ScriptFault('revo.script.validation.manifest', 'Script definition is invalid.', {
      details: { issues },
    });
  }

  return { input: inputSchema.jsonSchema, result: resultSchema.jsonSchema };
};
