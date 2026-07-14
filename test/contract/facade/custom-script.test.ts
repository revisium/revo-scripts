import { expect, test } from 'vitest';
import { z } from 'zod';

import type { ScriptResourceHandle } from '../../../src/core/spec/script-resources.js';
import {
  createRevoScripts,
  createScriptSchema,
  defineScript,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import type { GitStatusClient } from '../../../src/providers/git/contracts/v1/status.js';
import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { gitStatusScript } from '../../../src/scripts/git/status/versions/1.0.0/script.js';

const headSha = '0123456789abcdef0123456789abcdef01234567';

const inputSchema = createScriptSchema({
  id: 'revo.script.test.git-branch.input/v1',
  schema: z.strictObject({}),
  jsonSchema: 'input',
});
const resultSchema = createScriptSchema({
  id: 'revo.script.test.git-branch.result/v1',
  schema: z.strictObject({ branch: z.string(), headSha: z.string().nullable() }),
  jsonSchema: 'output',
});

const gitBranchScript = defineScript<
  Record<string, never>,
  Readonly<{ branch: string; headSha: string | null }>,
  Readonly<{
    repository: ScriptResourceHandle<Readonly<{ git: GitStatusClient }>>;
  }>
>({
  manifest: {
    schemaVersion: 'revo.script.manifest/v1',
    id: 'script:test/git-branch',
    version: '1.0.0',
    summary: 'Reads the current branch through the shared Git provider contract.',
    inputSchemaId: inputSchema.id,
    resultSchemaId: resultSchema.id,
    effectClass: 'read',
    permissions: ['git.branch.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    providers: [{ name: 'git', contract: 'revo.provider.git/v1', resource: 'repository' }],
    credentials: [],
    effects: ['git.read'],
    timeout: { wallClockMs: 5_000 },
    retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
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
  implementation: { id: '@revisium/revo-scripts/test/git-branch', version: '1.0.0' },
  handler: async (_input, context) => {
    const status = await context.resources.repository.clients.git.readStatus(context.signal);

    if (status.detached) {
      throw new Error('Test fixture must be attached to a branch.');
    }

    return { value: { branch: status.branch, headSha: status.headSha } };
  },
});

const twoGitScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/test/two-git-scripts',
  provenance: {
    packageName: '@revisium/revo-scripts',
    packageVersion: '0.0.0-test',
  },
  registerInto: (registrar) => {
    registrar.register(gitStatusScript);
    registrar.register(gitBranchScript);
  },
});

test('adds a second script on the Git contract without changing the consumer execution path', async () => {
  const scripts = createRevoScripts({
    definitions: [twoGitScripts()],
    providers: nodeGitProviders({
      processExecutor: async () => ({
        exitCode: 0,
        stdout: [`# branch.oid ${headSha}`, '# branch.head feature', ''].join('\0'),
        stderr: '',
      }),
    }),
    host: {
      workspaces: {
        resolve: async (workspaceId) => ({
          workspaceId,
          repositoryId: 'repository-123',
          absolutePath: '/tmp/revo-worktree',
        }),
      },
      credentials: {
        resolve: async () => {
          throw new Error('Git scripts must not resolve credentials.');
        },
      },
      events: { emit: async () => undefined },
    },
  });
  const plan = scripts.resolveForPlan({ id: 'script:test/git-branch', version: '1.0.0' });
  const result = await scripts.execute({
    executionId: 'custom-git-branch',
    script: plan.script,
    providers: plan.providers,
    input: {},
    bindings: {
      resources: {
        repository: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          workspaceId: 'workspace-456',
          access: 'read',
          grant: { permissions: ['git.branch.read'], effects: ['git.read'] },
          providerCoordinates: {},
        },
      },
      credentials: {},
    },
  });

  expect({
    manifests: scripts.listManifests().map((manifest) => manifest.id),
    result,
  }).toEqual({
    manifests: ['script:git/status', 'script:test/git-branch'],
    result: {
      ok: true,
      value: { branch: 'feature', headSha },
      evidence: [],
      attempts: 1,
    },
  });
});
