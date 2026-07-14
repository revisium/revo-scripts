import type { ScriptDefinitionInput } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import { validateImplementationIdentity } from './implementation-identity-validator.js';
import { validateJsonSchema } from './json-schema-validator.js';
import type { ValidatedDefinitionSchemas } from './validated-definition-schemas.js';

export const validateDefinition = <I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
): ValidatedDefinitionSchemas => {
  const inputSchema = validateJsonSchema(
    input.inputSchema,
    input.manifest.inputSchemaId,
    '/inputSchema',
  );
  const resultSchema = validateJsonSchema(
    input.resultSchema,
    input.manifest.resultSchemaId,
    '/resultSchema',
  );
  const issues = [
    ...inputSchema.issues,
    ...resultSchema.issues,
    ...validateImplementationIdentity(input.implementation.id, input.implementation.version),
  ];

  if (issues.length > 0) {
    throw new ScriptFault('revo.script.validation.manifest', 'Script definition is invalid.', {
      details: { issues },
    });
  }

  return { input: inputSchema.jsonSchema, result: resultSchema.jsonSchema };
};
