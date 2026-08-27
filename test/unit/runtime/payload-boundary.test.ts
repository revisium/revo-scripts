import { expect, test } from 'vitest';

import { ScriptAttemptRefSchema } from '../../../src/application/contracts/script-attempt-schemas.js';
import { systemClock } from '../../../src/runtime/execution/clock/system-clock.js';
import { assertEventWithinLimit } from '../../../src/runtime/execution/payload/assert-event-limit.js';
import { assertJsonPayloadWithinLimit } from '../../../src/runtime/execution/payload/assert-json-payload-limit.js';
import { serializeScriptJson } from '../../../src/runtime/execution/payload/serialize-script-json.js';
import { validateEvidence } from '../../../src/runtime/execution/payload/validate-evidence.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';

const faultCode = (operation: () => unknown): string => {
  try {
    operation();
  } catch (error: unknown) {
    if (error instanceof ScriptFault) {
      return error.code;
    }
    throw error;
  }
  throw new Error('Expected a ScriptFault.');
};

test('serializes only JSON-compatible values with kind-specific faults', () => {
  expect(serializeScriptJson({ message: 'ok' }, 'input')).toBe('{"message":"ok"}');
  expect(faultCode(() => serializeScriptJson(undefined, 'input'))).toBe(
    'revo.script.validation.input',
  );
  expect(faultCode(() => serializeScriptJson(undefined, 'event'))).toBe(
    'revo.script.validation.event',
  );
  expect(faultCode(() => serializeScriptJson(undefined, 'result'))).toBe(
    'revo.script.validation.result',
  );
  expect(faultCode(() => serializeScriptJson(BigInt(1), 'bindings'))).toBe(
    'revo.script.validation.input',
  );
});

test('enforces event, result, and evidence bounds', () => {
  assertEventWithinLimit({ name: 'small' });
  assertJsonPayloadWithinLimit({ value: 'small' }, 'result');
  validateEvidence([{ kind: 'log', ref: 'log:1', summary: 'ok' }]);

  expect(faultCode(() => assertEventWithinLimit({ details: 'x'.repeat(65_537) }))).toBe(
    'revo.script.validation.payload_limit',
  );
  expect(
    faultCode(() => assertJsonPayloadWithinLimit({ value: 'x'.repeat(1_048_577) }, 'result')),
  ).toBe('revo.script.validation.payload_limit');
  expect(
    faultCode(() =>
      validateEvidence(Array.from({ length: 65 }, () => ({ kind: 'log', ref: 'x' }))),
    ),
  ).toBe('revo.script.validation.payload_limit');
  expect(faultCode(() => validateEvidence([{ kind: 'log', ref: 'x'.repeat(2_049) }]))).toBe(
    'revo.script.validation.payload_limit',
  );
  expect(
    faultCode(() => validateEvidence([{ kind: 'log', ref: 'x', summary: 'x'.repeat(4_097) }])),
  ).toBe('revo.script.validation.payload_limit');
});

test('system clock resolves and aborts a bounded wait', async () => {
  const resolved = new AbortController();
  await systemClock.sleep(0, resolved.signal);
  expect(typeof systemClock.now()).toBe('number');

  const aborted = new AbortController();
  aborted.abort('stop');
  await expect(systemClock.sleep(1, aborted.signal)).rejects.toBe('stop');
});

test('public faults detach serializable details and reject raw detail values', async () => {
  const source = { nested: { value: 'safe' } };
  const safe = new ScriptFault('revo.script.execution.invariant', 'safe', { details: source });
  source.nested.value = 'changed';
  expect(safe.details).toEqual({ nested: { value: 'safe' } });
  expect(
    new ScriptFault('revo.script.execution.invariant', 'raw', {
      details: { raw: BigInt(1) },
      cause: new Error('/secret/path'),
    }).details,
  ).toBeUndefined();
  expect('cause' in safe).toBe(false);

  await expect(
    ScriptAttemptRefSchema.validate({ executionId: 'run\u0000bad', attemptId: 'attempt' }),
  ).resolves.toMatchObject({ ok: false });
});
