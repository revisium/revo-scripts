import { expect, test } from 'vitest';
import { z } from 'zod';

import {
  createRevoScripts,
  createScriptSchema,
  defineScript,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import { nodeGitProviders, type GitStatusClient } from '../../../src/providers/git/index.js';
import type { ScriptResourceHandle } from '../../../src/runtime/spec/index.js';
import { gitStatusScript } from '../../../src/scripts/git/index.js';
import {
  createGitHost,
  createGitScriptRequest,
  gitTestHeadSha,
} from '../../support/git/git-fixture.js';

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
  handler: {
    execute: async (_input, context) => {
      const status = await context.resources.repository.clients.git.readStatus(context.signal);

      if (status.detached) {
        throw new Error('Test fixture must be attached to a branch.');
      }

      return { value: { branch: status.branch, headSha: status.headSha } };
    },
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
  const { host } = createGitHost();
  const scripts = createRevoScripts({
    definitions: [twoGitScripts()],
    providers: nodeGitProviders({
      processExecutor: {
        execute: async () => ({
          exitCode: 0,
          stdout: [`# branch.oid ${gitTestHeadSha}`, '# branch.head feature', ''].join('\0'),
          stderr: '',
        }),
      },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:test/git-branch', version: '1.0.0' });
  const result = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'custom-git-branch',
      permissions: ['git.branch.read'],
    }),
  );

  expect({
    manifests: scripts.listManifests().map((manifest) => manifest.id),
    result,
  }).toEqual({
    manifests: ['script:git/status', 'script:test/git-branch'],
    result: {
      ok: true,
      value: { branch: 'feature', headSha: gitTestHeadSha },
      evidence: [],
      attempts: 1,
    },
  });
});
