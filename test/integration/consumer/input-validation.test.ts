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
        execute: async (request) => ({
          exitCode: 0,
          stdout:
            request.args[0] === 'rev-parse' || request.args[0] === 'write-tree'
              ? '0123456789abcdef0123456789abcdef01234567'
              : '',
          stderr: '',
        }),
      },
    }),
    host,
  });

  const result = await scripts.execute(
    createGitScriptRequest(
      { id: 'script:git/status', version: 1 },
      { executionId: 'single-input-validation' },
    ),
  );

  expect({ result, validations }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'workspace-change/v1',
        baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
        headCapture: 'git-tree:0123456789abcdef0123456789abcdef01234567',
        changedPaths: [],
        clean: true,
      },
      evidence: [],
      attempts: 1,
    },
    validations: 1,
  });
});
