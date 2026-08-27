import { z } from 'zod';

import type { GitStatusClient } from '../../../providers/git/contracts/git-status-client.js';
import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';
import type { ScriptSchemaOutput } from '../../../runtime/spec/schema/index.js';

const objectId = '[0-9a-f]{40}|[0-9a-f]{64}';

export const gitStatusInputSchema = createScriptSchema({
  id: 'revo.script.git.status.input/v1',
  schema: z.strictObject({
    resource: z.string().min(1).max(256),
    baseCapture: z.string().regex(new RegExp(`^git-commit:(?:${objectId})$`)),
    headCapture: z.string().regex(new RegExp(`^git-tree:(?:${objectId})$`)),
  }),
  jsonSchema: 'input',
});

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

/** The captures are re-observed before this snapshot is returned. */
export type GitStatusInput = ScriptSchemaOutput<typeof gitStatusInputSchema>;
export type GitStatusResult = ScriptSchemaOutput<typeof gitStatusResultSchema>;
export type GitStatusResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitStatusClient }>>;
}>;
