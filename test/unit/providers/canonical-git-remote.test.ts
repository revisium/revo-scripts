import { expect, test } from 'vitest';

import { canonicalGitRemote } from '../../../src/providers/git/adapters/node/remote/canonical-git-remote.js';
import { captureProviderFault } from '../../support/git/git-provider-fixture.js';

test('canonicalizes HTTPS and SCP-like Git remotes to one repository identity', () => {
  expect({
    canonical: canonicalGitRemote('github.com/Revisium/revo-scripts'),
    https: canonicalGitRemote('https://github.com/Revisium/revo-scripts.git'),
    trailingSlash: canonicalGitRemote('https://github.com/Revisium/revo-scripts.git/'),
    ssh: canonicalGitRemote('git@github.com:Revisium/revo-scripts.git'),
  }).toEqual({
    canonical: 'github.com/revisium/revo-scripts',
    https: 'github.com/revisium/revo-scripts',
    trailingSlash: 'github.com/revisium/revo-scripts',
    ssh: 'github.com/revisium/revo-scripts',
  });
});

test('rejects a remote that cannot identify a host and repository', async () => {
  expect(
    await captureProviderFault(() => Promise.resolve(canonicalGitRemote('not-a-remote'))),
  ).toEqual({
    name: 'ScriptFault',
    code: 'revo.script.provider.invalid_response',
    message: 'Git returned an unsupported remote URL.',
    retryable: false,
  });
});
