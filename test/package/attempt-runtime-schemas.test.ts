import { expect, test } from 'vitest';

import {
  AttemptCancellationResultSchema,
  PreparedScriptBindingSchema,
  ScriptAttemptResultSchema,
  ScriptBindingInputSchema,
  ScriptEventSchema,
  ScriptFailureSchema,
  ScriptReconciliationResultSchema,
} from '../../src/index.js';

test('root exports validate compact portable attempt contracts', async () => {
  const bindingInput = await ScriptBindingInputSchema.validate({
    script: { id: 'script:test/schema', version: 1 },
    resources: {},
    credentials: {},
  });
  expect(bindingInput.ok).toBe(true);
  expect(
    (
      await ScriptBindingInputSchema.validate({
        script: { id: 'invalid', version: 0 },
        resources: {},
        credentials: {},
      })
    ).ok,
  ).toBe(false);

  const failure = {
    code: 'revo.script.execution.cleanup',
    message: 'cleanup failed',
    retryable: false,
    stage: 'cleanup',
    details: null,
    causes: [],
  };
  const failedTerminalEvent = terminalEvent('revo.script.failed', {
    code: failure.code,
    stage: failure.stage,
    retryable: failure.retryable,
  });
  const cancelledTerminalEvent = terminalEvent('revo.script.cancelled');
  expect((await ScriptFailureSchema.validate(failure)).ok).toBe(true);
  expect(
    (
      await ScriptAttemptResultSchema.validate({
        kind: 'failed',
        error: failure,
        evidence: [],
        terminalEvent: failedTerminalEvent,
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await AttemptCancellationResultSchema.validate({
        kind: 'alreadyTerminal',
        result: { kind: 'cancelled', evidence: [], terminalEvent: cancelledTerminalEvent },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await ScriptAttemptResultSchema.validate({
        kind: 'uncertain',
        trigger: 'timeout',
        stage: 'handler',
        evidence: [],
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await ScriptReconciliationResultSchema.validate({
        kind: 'uncertain',
        result: { kind: 'uncertain', trigger: 'cancellation', stage: 'cleanup', evidence: [] },
      })
    ).ok,
  ).toBe(true);
  expect((await ScriptReconciliationResultSchema.validate({ kind: 'unknown' })).ok).toBe(true);
  expect(
    (
      await ScriptEventSchema.validate({
        name: 'revo.script.succeeded',
        details: {
          script: { id: 'script:test/schema', version: 1 },
          definitionDigest: `sha256:${'0'.repeat(64)}`,
          attemptOrdinal: 1,
          timestampMs: 0,
          evidenceCount: 0,
        },
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await ScriptEventSchema.validate({
        name: 'revo.script.started',
        details: {
          script: { id: 'script:test/schema', version: 1 },
          definitionDigest: `sha256:${'0'.repeat(64)}`,
          attemptOrdinal: 1,
          timestampMs: -1,
        },
      })
    ).ok,
  ).toBe(false);
});

test('prepared binding schema rejects live handles and secret fields', async () => {
  const base = {
    schemaVersion: 'prepared-script-binding/v1',
    script: { id: 'script:test/schema', version: 1 },
    definitionDigest: `sha256:${'0'.repeat(64)}`,
    implementation: { id: 'test', version: '1.0.0', buildDigest: `sha256:${'1'.repeat(64)}` },
    providers: [],
    resources: {},
    credentials: {},
    attemptPolicy: {
      timeoutMs: 1,
      terminationGraceMs: 1_000,
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
    },
  };
  expect((await PreparedScriptBindingSchema.validate(base)).ok).toBe(true);
  expect(
    (await PreparedScriptBindingSchema.validate({ ...base, secret: 'never portable' })).ok,
  ).toBe(false);
  expect(
    (
      await PreparedScriptBindingSchema.validate({
        ...base,
        resources: {
          repository: {
            resourceRef: 'resource:test',
            descriptor: {
              resourceId: 'resource:test',
              kind: 'repository',
              repositoryId: 'repository:test',
              providerCoordinates: {},
              grant: { permissions: [], operations: [] },
            },
            requirement: { kind: 'repository', access: 'admin' },
          },
        },
      })
    ).ok,
  ).toBe(true);
});

test('root exports reject oversized portable attempt results and events', async () => {
  const oversizedValue = 'x'.repeat(1_048_576);
  expect(
    (
      await ScriptAttemptResultSchema.validate({
        kind: 'succeeded',
        value: oversizedValue,
        evidence: [],
        terminalEvent: terminalEvent('revo.script.succeeded', { evidenceCount: 0 }),
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await ScriptEventSchema.validate({
        name: 'consumer.progress',
        details: { payload: 'x'.repeat(65_536) },
      })
    ).ok,
  ).toBe(false);
});

test('terminal result schemas require the exact terminal event coupling', async () => {
  const succeeded = {
    kind: 'succeeded',
    value: { ok: true },
    evidence: [],
    terminalEvent: terminalEvent('revo.script.succeeded', { evidenceCount: 0 }),
  };
  expect((await ScriptAttemptResultSchema.validate(succeeded)).ok).toBe(true);
  expect(
    (
      await ScriptAttemptResultSchema.validate({
        ...succeeded,
        terminalEvent: terminalEvent('revo.script.failed', {
          code: 'revo.script.provider.rejected',
          stage: 'provider',
          retryable: false,
        }),
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await ScriptAttemptResultSchema.validate({
        kind: 'uncertain',
        trigger: 'timeout',
        stage: 'handler',
        evidence: [],
        terminalEvent: terminalEvent('revo.script.timed_out', {
          code: 'revo.script.timeout.wall_clock',
        }),
      })
    ).ok,
  ).toBe(false);
});

const terminalEvent = (
  name:
    | 'revo.script.succeeded'
    | 'revo.script.failed'
    | 'revo.script.cancelled'
    | 'revo.script.timed_out',
  extra: Readonly<Record<string, unknown>> = {},
) => ({
  emissionOrdinal: 1,
  event: {
    name,
    details: {
      script: { id: 'script:test/schema', version: 1 },
      definitionDigest: `sha256:${'0'.repeat(64)}`,
      attemptOrdinal: 1,
      timestampMs: 0,
      ...extra,
    },
  },
});
