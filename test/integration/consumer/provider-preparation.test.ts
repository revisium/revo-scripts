import { expect, test } from 'vitest';

import { createMultiProviderConsumerFixture } from '../../support/consumer/multi-provider-consumer-fixture.js';

test('rejects duplicate client keys and disposes every prepared provider', async () => {
  const fixture = createMultiProviderConsumerFixture({
    alphaClient: 'shared',
    betaClient: 'shared',
  });

  const result = await fixture.scripts.execute(fixture.request);

  expect({ result, created: fixture.created, disposed: fixture.disposed }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.client_conflict',
        message: 'Provider client shared is already attached to resource repository.',
        retryable: false,
      },
      attempts: 0,
    },
    created: ['alpha', 'beta'],
    disposed: ['alpha', 'beta'],
  });
});

test('disposes completed preparation when a later provider fails', async () => {
  const fixture = createMultiProviderConsumerFixture({
    alphaClient: 'alpha',
    betaClient: 'beta',
    betaFailure: new Error('provider diagnostics that must not escape'),
  });

  const result = await fixture.scripts.execute(fixture.request);

  expect({ result, created: fixture.created, disposed: fixture.disposed }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.unexpected',
        message: 'Script provider preparation failed.',
        retryable: false,
      },
      attempts: 0,
    },
    created: ['alpha', 'beta'],
    disposed: ['alpha'],
  });
});
