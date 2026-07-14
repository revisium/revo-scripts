import { z } from 'zod';

import { createScriptSchema } from '../../../runtime/definition/schema/create-script-schema.js';

export const gitStatusInputSchema = createScriptSchema({
  id: 'revo.script.git.status.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});

const boundedCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const headSha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const statusCounts = {
  clean: z.boolean(),
  stagedCount: boundedCount,
  unstagedCount: boundedCount,
  untrackedCount: boundedCount,
  conflictedCount: boundedCount,
};

export const gitStatusResultSchema = createScriptSchema({
  id: 'revo.script.git.status.result/v1',
  schema: z.discriminatedUnion('detached', [
    z.strictObject({
      branch: z.null(),
      headSha,
      detached: z.literal(true),
      ...statusCounts,
    }),
    z.strictObject({
      branch: z.string().max(255),
      headSha: headSha.nullable(),
      detached: z.literal(false),
      ...statusCounts,
    }),
  ]),
  jsonSchema: 'output',
});
