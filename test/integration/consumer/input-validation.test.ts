import { expect, test } from 'vitest';

import {
  createRevoScripts,
  defineScript,
  type ScriptDefinitionModule,
} from '../../../src/index.js';
import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { gitStatusScript } from '../../../src/scripts/git/index.js';
import { createGitHost, createGitScriptRequest } from '../../support/git/git-fixture.js';

test('validates script input once before constructing provider clients', async () => {
  let validations = 0;
  const countingDefinition = defineScript({
    ...gitStatusScript,
    inputSchema: {
      id: gitStatusScript.inputSchema.id,
      validate: async (value) => {
        validations += 1;
        return gitStatusScript.inputSchema.validate(value);
      },
      toJsonSchema: () => gitStatusScript.inputSchema.toJsonSchema(),
    },
  });
  const definitions: ScriptDefinitionModule = {
    id: '@revisium/revo-scripts/test/counting-input-validation',
    provenance: {
      packageName: '@revisium/revo-scripts',
      packageVersion: '0.0.0-test',
    },
    registerInto: (registrar) => {
      registrar.register(countingDefinition);
    },
  };
  const { host } = createGitHost();
  const scripts = createRevoScripts({
    definitions: [definitions],
    providers: nodeGitProviders({
      processExecutor: {
        execute: async () => ({
          exitCode: 0,
          stdout: '# branch.oid (initial)\0# branch.head master\0',
          stderr: '',
        }),
      },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  const result = await scripts.execute(
    createGitScriptRequest(plan, { executionId: 'single-input-validation' }),
  );

  expect({ result, validations }).toEqual({
    result: {
      ok: true,
      value: {
        branch: 'master',
        headSha: null,
        detached: false,
        clean: true,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        conflictedCount: 0,
      },
      evidence: [],
      attempts: 1,
    },
    validations: 1,
  });
});
