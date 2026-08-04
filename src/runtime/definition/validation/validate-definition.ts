import type { ScriptImplementationIdentity } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptManifestAuthoringV1 } from '../../spec/manifest/index.js';
import type { ScriptSchema } from '../../spec/schema/index.js';
import { validateImplementationIdentity } from './implementation-identity-validator.js';
import { validateJsonSchema } from './json-schema-validator.js';
import type { ValidatedDefinitionSchemas } from './validated-definition-schemas.js';

export const validateDefinition = <I, O>(
  input: Readonly<{
    manifest: ScriptManifestAuthoringV1;
    inputSchema: ScriptSchema<I>;
    resultSchema: ScriptSchema<O>;
    implementation: ScriptImplementationIdentity;
  }>,
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
    ...validateImplementationIdentity(
      input.implementation.id,
      input.implementation.version,
      input.implementation.buildDigest,
    ),
  ];

  if (issues.length > 0) {
    throw new ScriptFault('revo.script.validation.manifest', 'Script definition is invalid.', {
      details: { issues },
    });
  }

  return { input: inputSchema.jsonSchema, result: resultSchema.jsonSchema };
};
