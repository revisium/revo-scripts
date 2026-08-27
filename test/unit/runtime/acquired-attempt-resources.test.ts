import { expect, test } from 'vitest';

import { disposeAll } from '../../../src/application/execution/acquired-attempt-resources.js';

test('disposes every acquired provider and credential even when one cleanup fails', async () => {
  const calls: string[] = [];

  await expect(
    disposeAll(
      [
        {
          clients: {},
          dispose: async () => {
            calls.push('provider:first');
          },
        },
        {
          clients: {},
          dispose: async () => {
            calls.push('provider:second');
            throw new Error('cleanup failure');
          },
        },
      ],
      [
        {
          alias: 'credential:test',
          provider: 'test',
          secret: 'secret',
          dispose: async () => {
            calls.push('credential');
          },
        },
      ],
    ),
  ).rejects.toMatchObject({ code: 'revo.script.execution.cleanup' });

  expect(calls.sort()).toEqual(['credential', 'provider:first', 'provider:second']);
});
