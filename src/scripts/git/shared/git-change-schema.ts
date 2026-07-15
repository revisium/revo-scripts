import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const gitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

export const gitChangeShape = {
  schemaVersion: z.literal('git-change/v1'),
  repositoryId: z.string().min(1).max(256),
  remoteIdentity: z.string().min(1).max(512),
  branch: z.string().min(1).max(256),
  baseCommit: gitObjectIdSchema,
  headCommit: gitObjectIdSchema,
  commits: z.array(gitObjectIdSchema).min(1).max(1_024),
};

export const gitChangeSchema = createScriptSchema({
  id: 'schema:gitChange/v1',
  schema: z.strictObject(gitChangeShape),
  jsonSchema: 'output',
});
