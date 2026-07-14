import { expect, test } from 'vitest';

import { disposeProviderResources } from '../../../src/application/providers/preparation/dispose-provider-resources.js';
import type { PreparedProviderClients } from '../../../src/host/index.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';

test('attempts every provider cleanup when one disposer throws synchronously', async () => {
  const disposed: string[] = [];
  const providers: readonly PreparedProviderClients[] = [
    {
      clients: {},
      dispose: () => {
        disposed.push('first');
        throw new Error('first cleanup failed');
      },
    },
    {
      clients: {},
      dispose: async () => {
        disposed.push('second');
      },
    },
  ];

  const failure = await disposeProviderResources(providers, []).catch((error: unknown) => {
    if (!(error instanceof ScriptFault)) {
      throw error;
    }

    return { code: error.code, message: error.message, retryable: error.retryable };
  });

  expect({ failure, disposed }).toEqual({
    failure: {
      code: 'revo.script.provider.cleanup_failed',
      message: 'Provider resources could not be disposed safely.',
      retryable: false,
    },
    disposed: ['first', 'second'],
  });
});
