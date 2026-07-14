import { expect, test } from 'vitest';

import type { ScriptProviderRegistration } from '../../../src/host/index.js';
import { createRevoScripts, gitScripts } from '../../../src/index.js';
import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import {
  createGitHost,
  requireNodeGitProviderRegistration,
} from '../../support/git/git-fixture.js';

const processExecutor = {
  execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
};

const { host } = createGitHost({
  resolveWorkspace: async () => {
    throw new Error('Workspace resolution is not expected during startup.');
  },
  resolveCredential: async () => {
    throw new Error('Credential resolution is not expected during startup.');
  },
});

const captureFault = (operation: () => unknown) => {
  try {
    operation();
  } catch (error: unknown) {
    if (!(error instanceof ScriptFault)) {
      throw new TypeError('Expected a ScriptFault.', { cause: error });
    }

    return { code: error.code, message: error.message };
  }

  throw new Error('Expected operation to fail.');
};

test('composes the Git definition family without per-script registration', () => {
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({ processExecutor }),
    host,
  });

  expect(scripts.listManifests().map((manifest) => `${manifest.id}@${manifest.version}`)).toEqual([
    'script:git/commit@1.0.0',
    'script:git/push@1.0.0',
    'script:git/status@1.0.0',
  ]);
});

test('fails startup for duplicate definition modules and provider implementations', () => {
  const definitionModule = gitScripts();
  const providers = nodeGitProviders({ processExecutor });

  expect({
    definition: captureFault(() =>
      createRevoScripts({
        definitions: [definitionModule, definitionModule],
        providers,
        host,
      }),
    ),
    provider: captureFault(() =>
      createRevoScripts({
        definitions: [definitionModule],
        providers: [...providers, ...providers],
        host,
      }),
    ),
  }).toEqual({
    definition: {
      code: 'revo.script.execution.duplicate_definition_module',
      message: 'Definition module is registered more than once.',
    },
    provider: {
      code: 'revo.script.provider.duplicate',
      message: 'Provider implementation is registered more than once.',
    },
  });
});

test('fails startup for absent, ambiguous, or incomplete provider coverage', () => {
  const registration = requireNodeGitProviderRegistration({ processExecutor });

  const alternate: ScriptProviderRegistration = {
    module: {
      ...registration.module,
      id: 'provider:git/alternate',
      implementationDigest: `sha256:${'1'.repeat(64)}`,
    },
    useForNewPlans: true,
  };
  const missingEffect: ScriptProviderRegistration = {
    module: { ...registration.module, effects: [] },
    useForNewPlans: true,
  };
  const duplicateEffect: ScriptProviderRegistration = {
    module: { ...registration.module, effects: ['git.read', 'git.read'] },
    useForNewPlans: true,
  };

  expect({
    absent: captureFault(() =>
      createRevoScripts({ definitions: [gitScripts()], providers: [], host }),
    ),
    ambiguous: captureFault(() =>
      createRevoScripts({
        definitions: [gitScripts()],
        providers: [registration, alternate],
        host,
      }),
    ),
    effect: captureFault(() =>
      createRevoScripts({
        definitions: [gitScripts()],
        providers: [missingEffect],
        host,
      }),
    ),
    duplicateEffect: captureFault(() =>
      createRevoScripts({
        definitions: [gitScripts()],
        providers: [duplicateEffect],
        host,
      }),
    ),
  }).toEqual({
    absent: {
      code: 'revo.script.provider.contract_missing',
      message: 'Provider contract revo.provider.git/v1 has no new-plan default.',
    },
    ambiguous: {
      code: 'revo.script.provider.ambiguous_default',
      message: 'Provider contract has more than one new-plan default.',
    },
    effect: {
      code: 'revo.script.provider.effect_missing',
      message: 'No selected provider owns effect git.read.',
    },
    duplicateEffect: {
      code: 'revo.script.provider.invalid_definition',
      message: 'Provider effects must be unique.',
    },
  });
});
