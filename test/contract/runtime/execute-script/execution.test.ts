import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import type { ScriptSchema } from '../../../../src/runtime/spec/schema/index.js';
import { echoDefinition, echoResultSchema } from '../../../support/runtime/echo-script-fixture.js';
import { executeRuntimeScenario } from '../../../support/runtime/runtime-mechanics.js';

test('executes one registered script and returns its typed result', async () => {
  const { events, result } = await executeRuntimeScenario(echoDefinition, {
    executionId: 'execution-1',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: true,
    value: { echoed: 'hello' },
    evidence: [],
    attempts: 1,
  });
  expect(events).toEqual([
    {
      name: 'revo.script.started',
      details: {
        executionId: 'execution-1',
        scriptId: 'script:test/echo',
        scriptVersion: '1.0.0',
        definitionDigest: echoDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
      },
    },
    {
      name: 'revo.script.succeeded',
      details: {
        executionId: 'execution-1',
        scriptId: 'script:test/echo',
        scriptVersion: '1.0.0',
        definitionDigest: echoDefinition.definitionDigest,
        attempt: 1,
        timestampMs: 1_000,
        durationMs: 0,
      },
    },
  ]);
});

test('rejects an invalid handler result through the declared result schema', async () => {
  const rejectingResultSchema: ScriptSchema<{ echoed: string }> = {
    id: echoResultSchema.id,
    toJsonSchema: () => echoResultSchema.toJsonSchema(),
    validate: async () => ({
      ok: false,
      issues: [{ message: 'Expected one echoed string.', path: ['echoed'] }],
    }),
  };
  const invalidResultDefinition = defineScript({
    ...echoDefinition,
    resultSchema: rejectingResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/result', version: '1.0.0' },
  });
  const { result } = await executeRuntimeScenario(invalidResultDefinition, {
    executionId: 'execution-invalid-result',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.validation.result',
      message: 'Script result is invalid.',
      retryable: false,
      details: {
        issues: [{ message: 'Expected one echoed string.', path: ['echoed'] }],
      },
    },
    attempts: 1,
  });
});

test('does not expose an unknown handler error through the package boundary', async () => {
  const unknownFailureDefinition = defineScript({
    ...echoDefinition,
    implementation: { id: '@revisium/revo-scripts/test/unknown-failure', version: '1.0.0' },
    handler: {
      execute: async () => {
        throw new Error('secret provider diagnostics');
      },
    },
  });
  const { result } = await executeRuntimeScenario(unknownFailureDefinition, {
    executionId: 'execution-unknown-failure',
    input: { message: 'hello' },
    resources: {},
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'revo.script.execution.unexpected',
      message: 'Script execution failed unexpectedly.',
      retryable: false,
    },
    attempts: 1,
  });
});
