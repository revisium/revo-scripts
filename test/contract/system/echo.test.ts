import { expect, test } from 'vitest';

import { systemEchoScript } from '../../../src/scripts/system/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';

test('returns bounded JSON unchanged without resources or effects', async () => {
  const harness = createScriptContractHarness(systemEchoScript, {
    executionId: 'system-echo-contract',
    resources: {},
  });
  const input = { message: 'Hello from Revo' };

  const execution = await harness.execute(input);

  expect(execution.result).toEqual({
    ok: true,
    value: input,
    evidence: [],
    attempts: 1,
  });
});

test('accepts a message at the 65,536-character schema bound', async () => {
  const harness = createScriptContractHarness(systemEchoScript, {
    executionId: 'system-echo-bounds',
    resources: {},
  });
  const input = { message: 'x'.repeat(65_536) };

  const execution = await harness.execute(input);

  expect(execution.result).toEqual({
    ok: true,
    value: input,
    evidence: [],
    attempts: 1,
  });
});

test('rejects a message above the 65,536-character schema bound', async () => {
  const harness = createScriptContractHarness(systemEchoScript, {
    executionId: 'system-echo-bounds-exceeded',
    resources: {},
  });

  const execution = await harness.execute({ message: 'x'.repeat(65_537) });

  expect(execution.result).toMatchObject({
    ok: false,
    error: { code: 'revo.script.validation.input' },
  });
});
