import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const gitStatusInputSchema = createScriptSchema({
  id: 'revo.script.git.status.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const objectId = '[0-9a-f]{40}|[0-9a-f]{64}';
const changedPath = z.strictObject({
  path: z.string().min(1).max(4_096),
  status: z.enum(['added', 'modified', 'deleted', 'renamed', 'untracked']),
});

export const gitStatusResultSchema = createScriptSchema({
  id: 'schema:workspaceChange/v1',
  schema: z.strictObject({
    schemaVersion: z.literal('workspace-change/v1'),
    baseCapture: z.string().regex(new RegExp(`^git-commit:(?:${objectId})$`)),
    headCapture: z.string().regex(new RegExp(`^git-tree:(?:${objectId})$`)),
    changedPaths: z.array(changedPath).max(2_048),
    clean: z.boolean(),
  }),
  jsonSchema: 'output',
});
