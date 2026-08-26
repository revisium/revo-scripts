import { expect, test, vi } from 'vitest';
/* eslint-disable no-await-in-loop -- timeout and cancellation share one fake-clock fixture and must run serially. */

import type { ScriptProviderModule } from '../../../src/host/providers/script-provider-module.js';
import { createRevoScripts, defineScript, ScriptFault } from '../../../src/index.js';
import type { ScriptHandler } from '../../../src/runtime/spec/definition/script-handler.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type TestHandler = ScriptHandler<{ message: string }, { echoed: string }, ScriptResourceMap>;

interface ScenarioOptions {
  readonly handler: TestHandler;
  readonly firstDisposeFails?: boolean;
  readonly firstClientName?: string;
  readonly secondClientName?: string;
  readonly secondFailure?: ScriptFault;
  readonly timeoutMs?: number;
}

interface Counters {
  firstCredentialAcquire: number;
  secondCredentialAcquire: number;
  firstCredentialDispose: number;
  secondCredentialDispose: number;
  firstProviderCreate: number;
  secondProviderCreate: number;
  firstProviderDispose: number;
  secondProviderDispose: number;
}

const createScenario = ({
  handler,
  firstDisposeFails = false,
  firstClientName = 'first',
  secondClientName = 'second',
  secondFailure,
  timeoutMs = 1_000,
}: ScenarioOptions) => {
  const counters: Counters = {
    firstCredentialAcquire: 0,
    secondCredentialAcquire: 0,
    firstCredentialDispose: 0,
    secondCredentialDispose: 0,
    firstProviderCreate: 0,
    secondProviderCreate: 0,
    firstProviderDispose: 0,
    secondProviderDispose: 0,
  };
  const firstProvider: ScriptProviderModule = {
    id: 'provider:test/attempt-resource-first',
    contract: 'revo.provider.attempt-first/v1',
    implementationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000082',
    provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
    operations: ['git.read'],
    workspace: 'none',
    createResourceClients: async () => {
      counters.firstProviderCreate += 1;
      return {
        clients: { [firstClientName]: {} },
        dispose: async () => {
          counters.firstProviderDispose += 1;
          if (firstDisposeFails) {
            throw new Error('First provider disposal failed.');
          }
        },
      };
    },
  };
  const secondProvider: ScriptProviderModule = {
    id: 'provider:test/attempt-resource-second',
    contract: 'revo.provider.attempt-second/v1',
    implementationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000083',
    provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
    operations: ['git.read'],
    workspace: 'none',
    createResourceClients: async () => {
      counters.secondProviderCreate += 1;
      if (secondFailure !== undefined) {
        throw secondFailure;
      }
      return {
        clients: { [secondClientName]: {} },
        dispose: async () => {
          counters.secondProviderDispose += 1;
        },
      };
    },
  };
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/attempt-resource-lifecycle',
      version: 1,
      summary: 'Exercises attempt acquisition and disposal through the public facade.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'read',
      permissions: [],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      providers: [
        {
          name: 'first',
          contract: 'revo.provider.attempt-first/v1',
          resource: 'repository',
        },
        {
          name: 'second',
          contract: 'revo.provider.attempt-second/v1',
          resource: 'repository',
        },
      ],
      credentials: [
        { name: 'first-token', provider: 'first', providerRequirement: 'first' },
        { name: 'second-token', provider: 'second', providerRequirement: 'second' },
      ],
      operations: ['git.read'],
      timeout: { wallClockMs: timeoutMs },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
      events: { allowed: [], detailPaths: [] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema: manualEchoResultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/attempt-resource-lifecycle',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000084',
    },
    handler,
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: definition.implementation.id,
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => registrar.register(definition),
      },
    ],
    providers: [{ module: firstProvider }, { module: secondProvider }],
    host: {
      resources: {
        inspect: async () => ({
          resourceId: 'resource:test',
          kind: 'repository',
          repositoryId: 'repository:test',
          providerCoordinates: {},
          grant: { permissions: [], operations: ['git.read'] },
        }),
      },
      workspaces: { inspect: async () => undefined, acquire: unavailable },
      credentials: {
        inspect: async (alias) => ({
          alias,
          provider: alias === 'credential:first' ? 'first' : 'second',
        }),
        acquire: async (alias) => {
          const first = alias === 'credential:first';
          if (first) {
            counters.firstCredentialAcquire += 1;
          } else {
            counters.secondCredentialAcquire += 1;
          }
          return {
            alias,
            provider: first ? 'first' : 'second',
            secret: `${alias}-secret`,
            dispose: async () => {
              if (first) {
                counters.firstCredentialDispose += 1;
              } else {
                counters.secondCredentialDispose += 1;
              }
            },
          };
        },
      },
      clock: { now: () => 123, sleep: async () => undefined },
    },
  });
  return { counters, definition, scripts };
};

const unavailable = async (): Promise<never> => {
  throw new Error('This lifecycle contract does not acquire a workspace.');
};

const prepareAttempt = async (
  scenario: ReturnType<typeof createScenario>,
  executionId: string,
  attemptId: string,
  controller: AbortController,
) => {
  const binding = await scenario.scripts.prepareBinding(
    {
      script: {
        id: scenario.definition.manifest.id,
        version: scenario.definition.manifest.version,
      },
      resources: { repository: { resourceRef: 'resource:test' } },
      credentials: { 'first-token': 'credential:first', 'second-token': 'credential:second' },
    },
    { signal: controller.signal },
  );
  return {
    executionId,
    attemptId,
    attemptOrdinal: 1,
    script: binding.script,
    binding,
    input: { message: 'lifecycle' },
  };
};

const executionContext = (controller: AbortController) => ({
  signal: controller.signal,
  events: { emit: async (): Promise<void> => undefined },
});

test('disposes the first provider and both credential leases after the second provider fails', async () => {
  const scenario = createScenario({
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
    secondFailure: new ScriptFault('revo.script.provider.second_failed', 'Second provider failed.'),
  });
  const controller = new AbortController();
  const input = await prepareAttempt(
    scenario,
    'run-second-failure',
    'attempt-second-failure',
    controller,
  );

  await expect(
    scenario.scripts.executeAttempt(input, executionContext(controller)),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.provider.second_failed',
      message: 'Second provider failed.',
      retryable: false,
      stage: 'provider',
      details: null,
      causes: [],
    },
    evidence: [],
  });
  expect(scenario.counters).toEqual({
    firstCredentialAcquire: 1,
    secondCredentialAcquire: 1,
    firstCredentialDispose: 1,
    secondCredentialDispose: 1,
    firstProviderCreate: 1,
    secondProviderCreate: 1,
    firstProviderDispose: 1,
    secondProviderDispose: 0,
  });
});

test('keeps cleanup primary and the second-provider fault as its cause when partial acquisition disposal fails', async () => {
  const scenario = createScenario({
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
    firstDisposeFails: true,
    secondFailure: new ScriptFault('revo.script.provider.second_failed', 'Second provider failed.'),
  });
  const controller = new AbortController();
  const input = await prepareAttempt(
    scenario,
    'run-cleanup-primary',
    'attempt-cleanup-primary',
    controller,
  );

  await expect(
    scenario.scripts.executeAttempt(input, executionContext(controller)),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.execution.cleanup',
      message: 'Provider resources could not be disposed safely.',
      retryable: false,
      stage: 'cleanup',
      details: null,
      causes: [{ kind: 'fault', code: 'revo.script.provider.second_failed', stage: 'provider' }],
    },
    evidence: [],
  });
  expect(scenario.counters).toEqual({
    firstCredentialAcquire: 1,
    secondCredentialAcquire: 1,
    firstCredentialDispose: 1,
    secondCredentialDispose: 1,
    firstProviderCreate: 1,
    secondProviderCreate: 1,
    firstProviderDispose: 1,
    secondProviderDispose: 0,
  });
});

test('disposes every acquired provider and credential when provider clients conflict', async () => {
  const scenario = createScenario({
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
    firstClientName: 'shared',
    secondClientName: 'shared',
  });
  const controller = new AbortController();
  const input = await prepareAttempt(
    scenario,
    'run-client-conflict',
    'attempt-client-conflict',
    controller,
  );

  await expect(
    scenario.scripts.executeAttempt(input, executionContext(controller)),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.provider.client_conflict',
      message: 'Provider client shared is already attached to resource repository.',
      retryable: false,
      stage: 'provider',
      details: null,
      causes: [],
    },
    evidence: [],
  });
  expect(scenario.counters).toEqual({
    firstCredentialAcquire: 1,
    secondCredentialAcquire: 1,
    firstCredentialDispose: 1,
    secondCredentialDispose: 1,
    firstProviderCreate: 1,
    secondProviderCreate: 1,
    firstProviderDispose: 1,
    secondProviderDispose: 1,
  });
});

test('does not dispose deferred resources before timeout or cancellation settles, then disposes them once', async () => {
  vi.useFakeTimers();
  try {
    for (const trigger of ['timeout', 'cancellation'] as const) {
      let release: (() => void) | undefined;
      let entered: (() => void) | undefined;
      const enteredHandler = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const scenario = createScenario({
        timeoutMs: 25,
        handler: {
          execute: async () =>
            await new Promise<{ value: { echoed: string } }>((resolve) => {
              release = () => resolve({ value: { echoed: 'late' } });
              entered?.();
            }),
        },
      });
      const controller = new AbortController();
      const input = await prepareAttempt(
        scenario,
        `run-deferred-${trigger}`,
        `attempt-deferred-${trigger}`,
        controller,
      );
      const execution = scenario.scripts.executeAttempt(input, executionContext(controller));
      await enteredHandler;
      if (trigger === 'timeout') {
        await vi.advanceTimersByTimeAsync(1_025);
      } else {
        controller.abort(new Error('Cancelled by the consumer.'));
        await vi.advanceTimersByTimeAsync(1_000);
      }

      await expect(execution).resolves.toEqual({
        kind: 'uncertain',
        trigger,
        stage: 'handler',
        evidence: [],
      });
      expect(scenario.counters).toEqual({
        firstCredentialAcquire: 1,
        secondCredentialAcquire: 1,
        firstCredentialDispose: 0,
        secondCredentialDispose: 0,
        firstProviderCreate: 1,
        secondProviderCreate: 1,
        firstProviderDispose: 0,
        secondProviderDispose: 0,
      });

      release?.();
      await vi.advanceTimersByTimeAsync(0);
      await expect(
        scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
      ).resolves.toMatchObject({ kind: 'terminal' });
      expect(scenario.counters).toEqual({
        firstCredentialAcquire: 1,
        secondCredentialAcquire: 1,
        firstCredentialDispose: 1,
        secondCredentialDispose: 1,
        firstProviderCreate: 1,
        secondProviderCreate: 1,
        firstProviderDispose: 1,
        secondProviderDispose: 1,
      });
    }
  } finally {
    vi.useRealTimers();
  }
});
