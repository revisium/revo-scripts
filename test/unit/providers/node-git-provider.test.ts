import { expect, test } from 'vitest';

import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { gitStatusScript } from '../../../src/scripts/git/status/script.js';
import {
  captureProviderFault,
  createProcessExecutor,
  gitProviderSignal,
} from '../../support/git/git-provider-fixture.js';

test('registers the Node Git provider and requires a resolved workspace', async () => {
  const executor = createProcessExecutor(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
  const registrations = nodeGitProviders({ processExecutor: executor });
  const provider = registrations[0]?.module;

  if (provider === undefined) {
    throw new Error('Expected the Node Git provider.');
  }

  const providerRequirement = gitStatusScript.manifest.providers[0];
  const resourceRequirement = gitStatusScript.manifest.resources[0];

  if (providerRequirement === undefined || resourceRequirement === undefined) {
    throw new Error('Expected Git status provider and resource requirements.');
  }

  expect(
    await captureProviderFault(() =>
      provider.createResourceClients({
        manifest: gitStatusScript.manifest,
        provider: providerRequirement,
        requirement: resourceRequirement,
        binding: {
          resourceId: 'target',
          kind: 'repository',
          repositoryId: 'repository-123',
          access: 'read',
          grant: { permissions: ['git.status.read'], effects: ['git.read'] },
          providerCoordinates: {},
        },
        credentials: {},
        signal: gitProviderSignal,
      }),
    ),
  ).toEqual({
    name: 'ScriptFault',
    code: 'revo.script.provider.workspace_required',
    message: 'The Git provider requires a resolved workspace.',
    retryable: false,
  });
});
