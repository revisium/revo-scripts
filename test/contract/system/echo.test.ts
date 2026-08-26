import { expect, test } from 'vitest';

import type { RevoScriptsHost } from '../../../src/host/revo-scripts-host.js';
import { createRevoScripts, systemScripts } from '../../../src/index.js';

const host: RevoScriptsHost = {
  resources: { inspect: async () => undefined },
  workspaces: {
    inspect: async () => undefined,
    acquire: async () => {
      throw new Error('System echo does not acquire workspaces.');
    },
  },
  credentials: {
    inspect: async () => undefined,
    acquire: async () => {
      throw new Error('System echo does not acquire credentials.');
    },
  },
};

const execute = async (executionId: string, input: Readonly<{ message: string }>) => {
  const scripts = createRevoScripts({ definitions: [systemScripts()], providers: [], host });
  const signal = new AbortController().signal;
  const script = { id: 'script:system/echo', version: 1 } as const;
  const binding = await scripts.prepareBinding(
    { script, resources: {}, credentials: {} },
    { signal },
  );
  return await scripts.executeAttempt(
    {
      executionId,
      attemptId: `${executionId}:attempt-1`,
      attemptOrdinal: 1,
      script,
      binding,
      input,
    },
    { signal, events: { emit: async () => undefined } },
  );
};

test('returns bounded JSON unchanged without resources or operations', async () => {
  const input = { message: 'Hello from Revo' };

  expect(await execute('system-echo-contract', input)).toMatchObject({
    kind: 'succeeded',
    value: input,
    evidence: [],
  });
});

test('accepts a message at the 65,536-character schema bound', async () => {
  const input = { message: 'x'.repeat(65_536) };

  expect(await execute('system-echo-bounds', input)).toMatchObject({
    kind: 'succeeded',
    value: input,
    evidence: [],
  });
});

test('rejects a message above the 65,536-character schema bound', async () => {
  await expect(
    execute('system-echo-bounds-exceeded', { message: 'x'.repeat(65_537) }),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: { code: 'revo.script.validation.input' },
  });
});
