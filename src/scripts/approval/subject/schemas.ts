import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

const boundedIdentifier = z.string().min(1).max(256);
const identity = z.strictObject({ scheme: boundedIdentifier, value: z.string().min(1).max(2_048) });
const evidence = z
  .array(
    z.strictObject({
      identity,
      title: z.string().min(1).max(512),
    }),
  )
  .max(128);

const subjectFields = {
  kind: z.enum(['plan', 'change', 'publication', 'operation']),
  identity,
  revision: identity,
  title: z.string().min(1).max(512),
  summary: z.string().min(1).max(4_096),
  evidence,
  risk: z.string().min(1).max(4_096).optional(),
};

export const approvalSubjectResultShape = {
  schemaVersion: z.literal('approval-subject/v1'),
  ...subjectFields,
};

export const approvalSubjectInputSchema = createScriptSchema({
  id: 'revo.script.approval.subject.input/v1',
  schema: z.strictObject(subjectFields),
  jsonSchema: 'input',
});

export const approvalSubjectResultSchema = createScriptSchema({
  id: 'schema:approvalSubject/v1',
  schema: z.strictObject(approvalSubjectResultShape),
  jsonSchema: 'output',
});
