import { z } from 'zod';

import { createScriptSchema } from '../runtime/create-script-schema.js';
import { defineScript } from '../runtime/define-script.js';
import type { ScriptResourceHandle } from '../spec/script-resources.js';

interface GitStatusCounts {
  readonly stagedCount: number;
  readonly unstagedCount: number;
  readonly untrackedCount: number;
  readonly conflictedCount: number;
}

export type GitStatusSnapshot = Readonly<
  GitStatusCounts &
    (
      | { readonly branch: null; readonly headSha: string; readonly detached: true }
      | { readonly branch: string; readonly headSha: string | null; readonly detached: false }
    )
>;

export type GitStatusResult = Readonly<GitStatusSnapshot & { readonly clean: boolean }>;

export interface GitStatusCapability {
  readStatus(signal: AbortSignal): Promise<GitStatusSnapshot>;
}

export type GitStatusResources = Readonly<{
  repository: ScriptResourceHandle<GitStatusCapability>;
}>;

const inputSchema = createScriptSchema({
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

const resultSchema = createScriptSchema({
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

const isClean = (status: GitStatusSnapshot): boolean =>
  status.stagedCount === 0 &&
  status.unstagedCount === 0 &&
  status.untrackedCount === 0 &&
  status.conflictedCount === 0;

export const gitStatusScript = defineScript<
  Record<string, never>,
  GitStatusResult,
  GitStatusResources
>({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:git/status',
    version: '1.0.0',
    summary: 'Reads bounded repository status counts.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'read',
    permissions: ['git.status.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    effects: ['git.read'],
    timeout: { wallClockMs: 5_000 },
    retry: { mode: 'transient', maxAttempts: 3, backoffMs: [100, 500] },
    idempotency: 'read-only',
    redaction: {
      inputPaths: [],
      resultPaths: [],
      errorPaths: [],
      eventPaths: [],
    },
    events: { allowed: [], detailPaths: [] },
  },
  inputSchema,
  resultSchema,
  implementation: { id: '@revisium/revo-scripts/git/status', version: '1.0.0' },
  handler: async (_input, context) => {
    const status = await context.resources.repository.capabilities.readStatus(context.signal);

    return {
      value: {
        ...status,
        clean: isClean(status),
      },
    };
  },
});
