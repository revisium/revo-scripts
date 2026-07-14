import { expect, test } from 'vitest';

import { createMutationConsumerFixture } from '../../support/consumer/mutation-consumer-fixture.js';

test('rejects a missing idempotency key before provider preparation', async () => {
  const missing = createMutationConsumerFixture();

  const result = await missing.scripts.execute(missing.request);

  expect({
    result,
    providerCreations: missing.observations.providerCreations,
  }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.key_required',
        message: 'This script requires an idempotency key.',
        retryable: false,
      },
      attempts: 0,
    },
    providerCreations: 0,
  });
});

test('passes one valid idempotency key through the generic consumer path', async () => {
  const { observations, request, scripts } = createMutationConsumerFixture();

  const result = await scripts.execute({ ...request, idempotencyKey: 'mutation-key-123' });

  expect({ result, observations }).toEqual({
    result: {
      ok: true,
      value: { idempotencyKey: 'mutation-key-123' },
      evidence: [],
      attempts: 1,
    },
    observations: {
      eventNames: ['revo.script.started', 'revo.script.succeeded'],
      providerCreations: 1,
      providerDisposals: 1,
    },
  });
});
