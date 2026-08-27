import { z } from 'zod';

import type { GitCommitClient } from '../../../providers/git/index.js';
import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';
import type { ScriptSchemaOutput } from '../../../runtime/spec/schema/index.js';
import { gitChangeSchema, gitObjectIdSchema } from '../shared/git-change-schema.js';

export const gitCommitResultSchema = gitChangeSchema;

export const gitCommitInputSchema = createScriptSchema({
  id: 'revo.script.git.commit.input/v1',
  schema: z.strictObject({
    resource: z.string().min(1).max(256),
    remoteIdentity: z.string().min(1).max(512),
    branch: z.string().min(1).max(256),
    expectedParent: gitObjectIdSchema,
    expectedTree: gitObjectIdSchema,
    title: z.string().min(1).max(16_384),
    issueRef: z
      .strictObject({
        owner: z.string().min(1).max(100),
        repository: z.string().min(1).max(100),
        number: z.number().int().positive(),
        url: z.url().max(2_048),
      })
      .optional(),
    issueAction: z.enum(['close', 'refs', 'none']),
    author: z.strictObject({
      name: z.string().min(1).max(256),
      email: z.email().max(320),
      timestamp: z.iso.datetime({ offset: true }),
    }),
  }),
  jsonSchema: 'input',
});

export type GitCommitInput = ScriptSchemaOutput<typeof gitCommitInputSchema>;
export type GitCommitResult = ScriptSchemaOutput<typeof gitCommitResultSchema>;
export type GitCommitResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitCommitClient }>>;
}>;
