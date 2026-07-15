import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import { ScriptFault } from '../../../../src/runtime/spec/errors/index.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import { executeRuntimeScenario } from '../../../support/runtime/runtime-mechanics.js';

test('rejects an input payload larger than one mebibyte before invoking the handler', async () => {
  let invoked = false;
  const boundedDefinition = defineScript({
    ...echoDefinition,
    handler: {
      execute: async (input) => {
        invoked = true;
        return { value: { echoed: input.message } };
      },
    },
  });
  const { events, result } = await executeRuntimeScenario(boundedDefinition, {
    executionId: 'execution-8',
    input: { message: 'x'.repeat(1_048_577) },
    resources: {},
  });

  expect({ result, invoked, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.payload_limit',
        message: 'Script input exceeds the 1048576-byte JSON payload limit.',
        retryable: false,
        details: { kind: 'input', limitBytes: 1_048_576, actualBytes: 1_048_591 },
      },
      attempts: 0,
    },
    invoked: false,
    eventNames: ['revo.script.failed'],
  });
});

test('fails an oversized custom event before it reaches the event sink', async () => {
  const eventDefinition = defineScript({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/event-limit',
      summary: 'Emits one bounded test event.',
      events: { allowed: ['test.large'], detailPaths: ['/payload'] },
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/event-limit',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000026',
    },
    handler: {
      execute: async (input, context) => {
        await context.emit({ name: 'test.large', details: { payload: 'x'.repeat(65_536) } });
        return { value: { echoed: input.message } };
      },
    },
  });
  const { events, result } = await executeRuntimeScenario(eventDefinition, {
    executionId: 'execution-event-limit',
    input: { message: 'hello' },
    resources: {},
  });

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.payload_limit',
        message: 'Script event exceeds the 65536-byte JSON payload limit.',
        retryable: false,
        details: { kind: 'event', limitBytes: 65_536, actualBytes: 65_582 },
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.failed'],
  });
});

test('rejects evidence that exceeds its bounded item count', async () => {
  const evidenceDefinition = defineScript({
    ...echoDefinition,
    implementation: {
      id: '@revisium/revo-scripts/test/evidence-limit',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000027',
    },
    handler: {
      execute: async (input) => ({
        value: { echoed: input.message },
        evidence: Array.from({ length: 65 }, (_, index) => ({
          kind: 'artifact' as const,
          ref: `artifact-${index}`,
        })),
      }),
    },
  });
  const { result } = await executeRuntimeScenario(evidenceDefinition, {
    executionId: 'execution-evidence-limit',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence exceeds the 64-item limit.',
      retryable: false,
      details: { kind: 'evidence', limit: 64, actual: 65 },
    },
    attempts: 1,
  });
});

test('rejects a result payload larger than one mebibyte', async () => {
  const largeResultDefinition = defineScript({
    ...echoDefinition,
    implementation: {
      id: '@revisium/revo-scripts/test/result-limit',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000028',
    },
    handler: { execute: async () => ({ value: { echoed: 'x'.repeat(1_048_577) } }) },
  });
  const { result } = await executeRuntimeScenario(largeResultDefinition, {
    executionId: 'execution-result-limit',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script result exceeds the 1048576-byte JSON payload limit.',
      retryable: false,
      details: { kind: 'result', limitBytes: 1_048_576, actualBytes: 1_048_590 },
    },
    attempts: 1,
  });
});

test('rejects an evidence reference longer than its Unicode code-point limit', async () => {
  const evidenceDefinition = defineScript({
    ...echoDefinition,
    implementation: {
      id: '@revisium/revo-scripts/test/evidence-ref',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000029',
    },
    handler: {
      execute: async (input) => ({
        value: { echoed: input.message },
        evidence: [{ kind: 'artifact', ref: 'x'.repeat(2_049) }],
      }),
    },
  });
  const { result } = await executeRuntimeScenario(evidenceDefinition, {
    executionId: 'execution-evidence-ref',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence ref exceeds the 2048-code-point limit.',
      retryable: false,
      details: { kind: 'evidence.ref', index: 0, limit: 2_048 },
    },
    attempts: 1,
  });
});

test('rejects an evidence summary longer than its Unicode code-point limit', async () => {
  const evidenceDefinition = defineScript({
    ...echoDefinition,
    implementation: {
      id: '@revisium/revo-scripts/test/evidence-summary',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000030',
    },
    handler: {
      execute: async (input) => ({
        value: { echoed: input.message },
        evidence: [{ kind: 'artifact', ref: 'artifact-1', summary: 'x'.repeat(4_097) }],
      }),
    },
  });
  const { result } = await executeRuntimeScenario(evidenceDefinition, {
    executionId: 'execution-evidence-summary',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.payload_limit',
      message: 'Script evidence summary exceeds the 4096-code-point limit.',
      retryable: false,
      details: { kind: 'evidence.summary', index: 0, limit: 4_096 },
    },
    attempts: 1,
  });
});

test('fails closed when typed fault details are not JSON-compatible', async () => {
  const failingDefinition = defineScript({
    ...echoDefinition,
    implementation: {
      id: '@revisium/revo-scripts/test/fault-details',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000031',
    },
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.unavailable', 'Provider is unavailable.', {
          details: { callback: () => undefined },
        });
      },
    },
  });
  const { result } = await executeRuntimeScenario(failingDefinition, {
    executionId: 'execution-invalid-fault-details',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.provider.unavailable',
      message: 'Provider is unavailable.',
      retryable: false,
      details: { redacted: '[INVALID_OR_OVERSIZED_DETAILS]' },
    },
    attempts: 1,
  });
});
