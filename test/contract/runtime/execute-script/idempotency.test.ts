import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import type { ScriptResourceMap } from '../../../../src/runtime/spec/resources/index.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import { executeRuntimeScenario } from '../../../support/runtime/runtime-mechanics.js';

const createMutationScenario = () => {
  const receivedKeys: string[] = [];
  const definition = defineScript<
    Readonly<{ message: string }>,
    Readonly<{ echoed: string }>,
    ScriptResourceMap
  >({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/mutation',
      summary: 'Performs one idempotent test mutation.',
      effectClass: 'write',
      permissions: ['git.test.write'],
      resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
      effects: ['git.write'],
      idempotency: 'required',
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: { id: '@revisium/revo-scripts/test/mutation', version: '1.0.0' },
    handler: {
      execute: async (input, context) => {
        receivedKeys.push(context.idempotencyKey ?? '[MISSING]');
        return { value: { echoed: input.message } };
      },
    },
  });
  const execute = async (idempotencyKey?: string) =>
    executeRuntimeScenario(definition, {
      executionId: 'idempotent-mutation',
      input: { message: 'handled' },
      resources: {
        repository: {
          name: 'repository',
          kind: 'repository',
          access: 'write',
          grant: { permissions: ['git.test.write'], effects: ['git.write'] },
          clients: {},
        },
      },
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });

  return { execute, receivedKeys };
};

test('rejects missing and malformed idempotency keys before handler invocation', async () => {
  const missing = createMutationScenario();
  const empty = createMutationScenario();
  const oversized = createMutationScenario();

  const executions = await Promise.all([
    missing.execute(),
    empty.execute(''),
    oversized.execute('x'.repeat(1_025)),
  ]);

  expect({
    results: executions.map(({ result }) => result),
    eventNames: executions.map(({ events }) => events.map((event) => event.name)),
    receivedKeys: [missing, empty, oversized].map(({ receivedKeys }) => receivedKeys),
  }).toEqual({
    results: [
      {
        ok: false,
        error: {
          code: 'revo.script.idempotency.key_required',
          message: 'This script requires an idempotency key.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.validation.input',
          message: 'Idempotency key must contain between 1 and 1024 Unicode code points.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.validation.input',
          message: 'Idempotency key must contain between 1 and 1024 Unicode code points.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    eventNames: [['revo.script.failed'], ['revo.script.failed'], ['revo.script.failed']],
    receivedKeys: [[], [], []],
  });
});

test('passes one valid idempotency key to the mutation handler', async () => {
  const scenario = createMutationScenario();

  const { events, result } = await scenario.execute('mutation-key-123');

  expect({
    result,
    eventNames: events.map((event) => event.name),
    receivedKeys: scenario.receivedKeys,
  }).toEqual({
    result: {
      ok: true,
      value: { echoed: 'handled' },
      evidence: [],
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.succeeded'],
    receivedKeys: ['mutation-key-123'],
  });
});
