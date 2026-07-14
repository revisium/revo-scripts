import { expect, test } from 'vitest';

import { defineScript } from '../../../../src/runtime/definition/define-script.js';
import type {
  ScriptResourceHandle,
  ScriptResourceMap,
} from '../../../../src/runtime/spec/resources/index.js';
import {
  echoDefinition,
  echoInputSchema,
  echoResultSchema,
} from '../../../support/runtime/echo-script-fixture.js';
import { executeRuntimeScenario } from '../../../support/runtime/runtime-mechanics.js';

const createResourceScenario = () => {
  let handlerCalls = 0;
  const definition = defineScript<
    Readonly<{ message: string }>,
    Readonly<{ echoed: string }>,
    ScriptResourceMap
  >({
    manifest: {
      ...echoDefinition.manifest,
      id: 'script:test/resource-contract',
      summary: 'Reads one prepared repository resource.',
      effectClass: 'read',
      permissions: ['git.status.read'],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      effects: ['git.read'],
    },
    inputSchema: echoInputSchema,
    resultSchema: echoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/resource-contract',
      version: '1.0.0',
    },
    handler: {
      execute: async (input) => {
        handlerCalls += 1;
        return { value: { echoed: input.message } };
      },
    },
  });

  return { definition, handlerCallCount: () => handlerCalls };
};

const repository = (
  overrides: Partial<ScriptResourceHandle<Record<string, never>>> = {},
): ScriptResourceHandle<Record<string, never>> => ({
  name: 'repository',
  kind: 'repository',
  access: 'read',
  grant: { permissions: ['git.status.read'], effects: ['git.read'] },
  clients: {},
  ...overrides,
});

const executeWithResources = async (
  definition: ReturnType<typeof createResourceScenario>['definition'],
  resources: ScriptResourceMap,
) => {
  const execution = await executeRuntimeScenario(definition, {
    executionId: 'resource-contract',
    input: { message: 'not-run' },
    resources,
  });

  return {
    result: execution.result,
    eventNames: execution.events.map((event) => event.name),
  };
};

test('rejects extra and structurally mismatched prepared resources', async () => {
  const scenario = createResourceScenario();

  const results = await Promise.all([
    executeWithResources(scenario.definition, {
      repository: repository(),
      unexpected: repository(),
    }),
    executeWithResources(scenario.definition, {
      repository: repository({ name: 'other' }),
    }),
    executeWithResources(scenario.definition, {
      repository: repository({ access: 'write' }),
    }),
  ]);

  expect({ results, handlerCalls: scenario.handlerCallCount() }).toEqual({
    results: [
      {
        result: {
          ok: false,
          error: {
            code: 'revo.script.permission.resource',
            message: 'Prepared resource unexpected is not declared by the script manifest.',
            retryable: false,
            details: { resource: 'unexpected' },
          },
          attempts: 0,
        },
        eventNames: ['revo.script.failed'],
      },
      {
        result: {
          ok: false,
          error: {
            code: 'revo.script.permission.resource',
            message: 'Prepared resource repository does not match its manifest requirement.',
            retryable: false,
            details: { resource: 'repository' },
          },
          attempts: 0,
        },
        eventNames: ['revo.script.failed'],
      },
      {
        result: {
          ok: false,
          error: {
            code: 'revo.script.permission.resource',
            message: 'Prepared resource repository does not match its manifest requirement.',
            retryable: false,
            details: { resource: 'repository' },
          },
          attempts: 0,
        },
        eventNames: ['revo.script.failed'],
      },
    ],
    handlerCalls: 0,
  });
});

test('rejects prepared resources without declared permission and effect grants', async () => {
  const scenario = createResourceScenario();

  const results = await Promise.all([
    executeWithResources(scenario.definition, {
      repository: repository({ grant: { permissions: [], effects: ['git.read'] } }),
    }),
    executeWithResources(scenario.definition, {
      repository: repository({ grant: { permissions: ['git.status.read'], effects: [] } }),
    }),
  ]);

  expect({ results, handlerCalls: scenario.handlerCallCount() }).toEqual({
    results: [
      {
        result: {
          ok: false,
          error: {
            code: 'revo.script.permission.grant',
            message: 'Prepared resource grant is missing permission git.status.read.',
            retryable: false,
            details: { permission: 'git.status.read', resource: 'repository' },
          },
          attempts: 0,
        },
        eventNames: ['revo.script.failed'],
      },
      {
        result: {
          ok: false,
          error: {
            code: 'revo.script.permission.effect',
            message: 'Prepared resource grant is missing effect git.read.',
            retryable: false,
            details: { effect: 'git.read', resource: 'repository' },
          },
          attempts: 0,
        },
        eventNames: ['revo.script.failed'],
      },
    ],
    handlerCalls: 0,
  });
});
