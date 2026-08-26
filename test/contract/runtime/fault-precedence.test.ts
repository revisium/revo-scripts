import { expect, test, vi } from 'vitest';

import type {
  ScriptAttemptExecutionContext,
  ScriptAttemptInput,
  ScriptEventEmission,
  ScriptTerminalAttemptResult,
} from '../../../src/application/contracts/script-attempt.js';
import { createRevoScripts } from '../../../src/application/create-revo-scripts.js';
import type { ScriptProviderModule } from '../../../src/host/providers/script-provider-module.js';
import { defineScript } from '../../../src/runtime/definition/define-script.js';
import type { ScriptHandler } from '../../../src/runtime/spec/definition/script-handler.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import type { ScriptCustomEvent } from '../../../src/runtime/spec/events/index.js';
import type { ScriptResourceMap } from '../../../src/runtime/spec/resources/index.js';
import type { ScriptSchema } from '../../../src/runtime/spec/schema/index.js';
import {
  manualEchoInputSchema,
  manualEchoResultSchema,
} from '../../support/runtime/echo-definition-input.js';

type TestHandler = ScriptHandler<{ message: string }, { echoed: string }, ScriptResourceMap>;

interface Scenario {
  readonly handler: TestHandler;
  readonly cleanupFails?: boolean;
  readonly timeoutMs?: number;
  readonly createClients?: ScriptProviderModule['createResourceClients'];
  readonly coordinateSchema?: ScriptSchema<Readonly<Record<string, unknown>>>;
  readonly resultSchema?: ScriptSchema<{ echoed: string }>;
  readonly dispose?: () => Promise<void>;
  readonly errorPaths?: readonly string[];
}

const createScenario = ({
  handler,
  cleanupFails = false,
  timeoutMs = 1_000,
  createClients,
  coordinateSchema,
  resultSchema = manualEchoResultSchema,
  dispose,
  errorPaths = [],
}: Scenario) => {
  const phases: string[] = [];
  const provider: ScriptProviderModule = {
    id: 'provider:test/fault-precedence',
    contract: 'revo.provider.test/v1',
    implementationDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000061',
    provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
    operations: ['git.read'],
    workspace: 'none',
    ...(coordinateSchema === undefined ? {} : { coordinateSchema }),
    createResourceClients:
      createClients ??
      (async () => ({
        clients: {},
        dispose:
          dispose ??
          (async () => {
            phases.push('cleanup');
            if (cleanupFails) {
              throw new Error('Cleanup failed.');
            }
          }),
      })),
  };
  const definition = defineScript({
    manifest: {
      schemaVersion: 'revo.script.manifest/v1',
      id: 'script:test/fault-precedence',
      version: 1,
      summary: 'Exercises public fault precedence.',
      inputSchemaId: manualEchoInputSchema.id,
      resultSchemaId: manualEchoResultSchema.id,
      impactClass: 'read',
      permissions: [],
      resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
      providers: [{ name: 'test', contract: 'revo.provider.test/v1', resource: 'repository' }],
      credentials: [],
      operations: ['git.read'],
      timeout: { wallClockMs: timeoutMs },
      retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
      idempotency: 'read-only',
      redaction: {
        inputPaths: [],
        resultPaths: [],
        errorPaths,
        eventPaths: ['/secret'],
      },
      events: { allowed: ['consumer.progress'], detailPaths: ['/secret', '/progress'] },
    },
    inputSchema: manualEchoInputSchema,
    resultSchema,
    implementation: {
      id: '@revisium/revo-scripts/test/fault-precedence',
      version: '1.0.0',
      buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000062',
    },
    handler: {
      execute: async (input, context) => {
        phases.push('handler');
        return await handler.execute(input, context);
      },
    },
  });
  const scripts = createRevoScripts({
    definitions: [
      {
        id: definition.implementation.id,
        provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
        registerInto: (registrar) => registrar.register(definition),
      },
    ],
    providers: [{ module: provider }],
    host: {
      resources: {
        inspect: async () => ({
          resourceId: 'resource:test',
          kind: 'repository',
          repositoryId: 'repository:test',
          providerCoordinates: coordinateSchema === undefined ? {} : { test: {} },
          grant: { permissions: [], operations: ['git.read'] },
        }),
      },
      workspaces: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('No workspace is required.');
        },
      },
      credentials: {
        inspect: async () => undefined,
        acquire: async () => {
          throw new Error('No credential is required.');
        },
      },
      clock: { now: () => 123, sleep: async () => undefined },
    },
  });

  return { definition, phases, scripts };
};

const prepareAttempt = async (scenario: ReturnType<typeof createScenario>) => {
  const controller = new AbortController();
  const binding = await scenario.scripts.prepareBinding(
    {
      script: {
        id: scenario.definition.manifest.id,
        version: scenario.definition.manifest.version,
      },
      resources: { repository: { resourceRef: 'resource:test' } },
      credentials: {},
    },
    { signal: controller.signal },
  );
  const input: ScriptAttemptInput = {
    executionId: 'execution-fault-precedence',
    attemptId: 'attempt-fault-precedence',
    attemptOrdinal: 1,
    script: binding.script,
    binding,
    input: { message: 'hello' },
  };
  return { controller, input };
};

const executionContext = (
  controller: AbortController,
  emit: (emission: ScriptEventEmission) => Promise<void>,
): ScriptAttemptExecutionContext => ({ signal: controller.signal, events: { emit } });

const expectTerminalEvent = (
  result: ScriptTerminalAttemptResult | { readonly kind: string },
  name:
    | 'revo.script.succeeded'
    | 'revo.script.failed'
    | 'revo.script.cancelled'
    | 'revo.script.timed_out',
  details: Readonly<Record<string, unknown>> = {},
): void => {
  if (!('terminalEvent' in result)) {
    throw new Error('Expected a terminal attempt result.');
  }
  expect(result.terminalEvent).toMatchObject({
    event: { name, details },
  });
};

const waitForAbort = async (signal: AbortSignal, started: () => void): Promise<never> => {
  started();
  return await new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
};

test('cleanup failure replaces a handler fault and preserves the handler fault as a cause', async () => {
  const scenario = createScenario({
    cleanupFails: true,
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.transient', 'Provider failed.', {
          retryable: true,
        });
      },
    },
  });
  const { controller, input } = await prepareAttempt(scenario);

  const result = await scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async () => undefined),
  );

  expect(result).toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.execution.cleanup',
      message: 'Provider resources could not be disposed safely.',
      retryable: false,
      stage: 'cleanup',
      details: null,
      causes: [{ kind: 'fault', code: 'revo.script.provider.transient', stage: 'provider' }],
    },
    evidence: [],
  });
  expectTerminalEvent(result, 'revo.script.failed', {
    code: 'revo.script.execution.cleanup',
    stage: 'cleanup',
    retryable: false,
  });
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
});

test('redacts declared error details through the public facade while preserving siblings', async () => {
  const scenario = createScenario({
    errorPaths: ['/secret'],
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.rejected', 'Provider rejected the operation.', {
          details: { secret: 'credential-value', sibling: 'preserved' },
        });
      },
    },
  });
  const { controller, input } = await prepareAttempt(scenario);

  await expect(
    scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    ),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.provider.rejected',
      details: { secret: '[REDACTED]', sibling: 'preserved' },
    },
  });
});

test('seals the succeeded terminal event in the result without sending a terminal event to the live sink', async () => {
  const scenario = createScenario({
    handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const emissions: ScriptEventEmission[] = [];

  const result = await scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async (emission) => {
      emissions.push(emission);
      if (emission.event.name !== 'revo.script.started') {
        throw new Error('Only live started/custom events may reach the sink.');
      }
    }),
  );

  expect(result).toMatchObject({ kind: 'succeeded', value: { echoed: 'hello' } });
  expectTerminalEvent(result, 'revo.script.succeeded', { evidenceCount: 0 });
  expect(emissions.map((emission) => emission.event.name)).toEqual(['revo.script.started']);
});

test('supervises restored provider coordinate validation after identity admission', async () => {
  vi.useFakeTimers();
  try {
    let hang = false;
    const coordinateSchema: ScriptSchema<Readonly<Record<string, unknown>>> = {
      id: 'test:coordinates',
      toJsonSchema: () => ({}),
      validate: async () => {
        if (hang) {
          return await new Promise<never>(() => undefined);
        }
        return { ok: true, value: {} };
      },
    };
    const scenario = createScenario({
      timeoutMs: 25,
      coordinateSchema,
      handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
    });
    const { controller, input } = await prepareAttempt(scenario);
    hang = true;

    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toEqual({
      kind: 'uncertain',
      trigger: 'timeout',
      stage: 'validation',
      evidence: [],
    });
    await expect(
      scenario.scripts.cancelAttempt(
        { executionId: input.executionId, attemptId: input.attemptId },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      kind: 'uncertain',
      result: { kind: 'uncertain', trigger: 'timeout', stage: 'validation', evidence: [] },
    });
  } finally {
    vi.useRealTimers();
  }
});

test('keeps caller cancellation observable while restored coordinate validation is unsettled', async () => {
  vi.useFakeTimers();
  try {
    let hang = false;
    const coordinateSchema: ScriptSchema<Readonly<Record<string, unknown>>> = {
      id: 'test:coordinates-cancellation',
      toJsonSchema: () => ({}),
      validate: async () => {
        if (hang) {
          return await new Promise<never>(() => undefined);
        }
        return { ok: true, value: {} };
      },
    };
    const scenario = createScenario({
      timeoutMs: 300,
      coordinateSchema,
      handler: { execute: async (input) => ({ value: { echoed: input.message } }) },
    });
    const { controller, input } = await prepareAttempt(scenario);
    hang = true;
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );

    controller.abort(new Error('Caller cancelled the attempt.'));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(execution).resolves.toEqual({
      kind: 'uncertain',
      trigger: 'cancellation',
      stage: 'validation',
      evidence: [],
    });
  } finally {
    vi.useRealTimers();
  }
});

test('duplicate admission does not allocate another deadline timer or abort listener', async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredHandler = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const scenario = createScenario({
      handler: {
        execute: async () =>
          await new Promise<{ value: { echoed: string } }>((resolve) => {
            release = () => resolve({ value: { echoed: 'late' } });
            entered?.();
          }),
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const first = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await enteredHandler;
    const timersBefore = vi.getTimerCount();
    const listenersBefore = addListener.mock.calls.length;

    await expect(
      scenario.scripts.executeAttempt(
        input,
        executionContext(controller, async () => undefined),
      ),
    ).rejects.toMatchObject({ code: 'revo.script.validation.attempt' });
    expect(vi.getTimerCount()).toBe(timersBefore);
    expect(addListener).toHaveBeenCalledTimes(listenersBefore);

    release?.();
    await expect(first).resolves.toMatchObject({ kind: 'succeeded' });
  } finally {
    vi.useRealTimers();
  }
});

test('returns uncertain without disposing live resources when a timed-out handler ignores abort', async () => {
  vi.useFakeTimers();
  try {
    let finishHandler: ((value: { value: { echoed: string } }) => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: {
        execute: async () =>
          await new Promise<{ value: { echoed: string } }>((resolve) => {
            finishHandler = resolve;
          }),
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const events: string[] = [];
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async (emission) => {
        events.push(emission.event.name);
      }),
    );

    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toEqual({
      kind: 'uncertain',
      trigger: 'timeout',
      stage: 'handler',
      evidence: [],
    });
    expect(scenario.phases).toEqual(['handler']);
    expect(events).toEqual(['revo.script.started']);
    await expect(
      scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
    ).resolves.toEqual({
      kind: 'uncertain',
      result: {
        kind: 'uncertain',
        trigger: 'timeout',
        stage: 'handler',
        evidence: [],
      },
    });

    finishHandler?.({ value: { echoed: 'late' } });
    await vi.advanceTimersByTimeAsync(0);

    const reconciled = await scenario.scripts.reconcileAttempt(input, {
      signal: controller.signal,
    });
    expect(reconciled).toMatchObject({
      kind: 'terminal',
      result: {
        kind: 'timedOut',
        error: {
          code: 'revo.script.timeout.wall_clock',
          message: 'Script wall-clock deadline expired.',
          retryable: false,
          stage: 'timeout',
          details: null,
          causes: [],
        },
        evidence: [],
      },
    });
    if (reconciled.kind !== 'terminal') {
      throw new Error('Expected the settled attempt to reconcile as terminal.');
    }
    expectTerminalEvent(reconciled.result, 'revo.script.timed_out', {
      code: 'revo.script.timeout.wall_clock',
    });
    expect(scenario.phases).toEqual(['handler', 'cleanup']);
    expect(events).toEqual(['revo.script.started']);
  } finally {
    vi.useRealTimers();
  }
});

test('a late fire-and-forget emit after uncertainty does not reach unhandledRejection', async () => {
  vi.useFakeTimers();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    let emit: ((event: ScriptCustomEvent) => Promise<void>) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: {
        execute: async (_input, context) => {
          emit = context.emit;
          return await new Promise<never>(() => undefined);
        },
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toMatchObject({ kind: 'uncertain', stage: 'handler' });

    void emit?.({ name: 'consumer.progress', details: { progress: 'late' } });
    await Promise.resolve();
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    vi.useRealTimers();
  }
});

test('returns uncertain cancellation until a non-cooperative handler settles', async () => {
  vi.useFakeTimers();
  try {
    let finishHandler: ((value: { value: { echoed: string } }) => void) | undefined;
    let entered: (() => void) | undefined;
    const scenario = createScenario({
      handler: {
        execute: async () =>
          await new Promise<{ value: { echoed: string } }>((resolve) => {
            finishHandler = resolve;
            entered?.();
          }),
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await started;
    controller.abort(new Error('caller cancelled'));

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(execution).resolves.toEqual({
      kind: 'uncertain',
      trigger: 'cancellation',
      stage: 'handler',
      evidence: [],
    });
    await expect(
      scenario.scripts.cancelAttempt(
        { executionId: input.executionId, attemptId: input.attemptId },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      kind: 'uncertain',
      result: { kind: 'uncertain', trigger: 'cancellation', stage: 'handler', evidence: [] },
    });

    finishHandler?.({ value: { echoed: 'late' } });
    await vi.advanceTimersByTimeAsync(0);
    const reconciled = await scenario.scripts.reconcileAttempt(input, {
      signal: controller.signal,
    });
    expect(reconciled).toMatchObject({
      kind: 'terminal',
      result: { kind: 'cancelled', evidence: [] },
    });
    if (reconciled.kind !== 'terminal') {
      throw new Error('Expected the settled attempt to reconcile as terminal.');
    }
    expectTerminalEvent(reconciled.result, 'revo.script.cancelled');
    expect(scenario.phases).toEqual(['handler', 'cleanup']);
  } finally {
    vi.useRealTimers();
  }
});

test('reports uncertain acquire while an uncooperative provider has no disposable handle', async () => {
  vi.useFakeTimers();
  try {
    let resolveAcquire: (() => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: { execute: async () => ({ value: { echoed: 'never-called' } }) },
      createClients: async () =>
        await new Promise((resolve) => {
          resolveAcquire = () => resolve({ clients: {}, dispose: async () => undefined });
        }),
    });
    const { controller, input } = await prepareAttempt(scenario);
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toMatchObject({ kind: 'uncertain', stage: 'acquire' });
    expect(scenario.phases).toEqual([]);
    resolveAcquire?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
    ).resolves.toMatchObject({
      kind: 'terminal',
    });
  } finally {
    vi.useRealTimers();
  }
});

test('reports uncertain cleanup without inventing a terminal event', async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: { execute: async () => ({ value: { echoed: 'ok' } }) },
      dispose: async () =>
        await new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const { controller, input } = await prepareAttempt(scenario);
    const events: string[] = [];
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async (emission) => {
        events.push(emission.event.name);
      }),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toMatchObject({ kind: 'uncertain', stage: 'cleanup' });
    expect(events).toEqual(['revo.script.started']);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
    ).resolves.toMatchObject({
      kind: 'terminal',
    });
  } finally {
    vi.useRealTimers();
  }
});

test('reports uncertain validation while result validation is still running', async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: { execute: async () => ({ value: { echoed: 'ok' } }) },
      resultSchema: {
        ...manualEchoResultSchema,
        validate: async () =>
          await new Promise((resolve) => {
            release = () => resolve({ ok: true, value: { echoed: 'ok' } });
          }),
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toMatchObject({ kind: 'uncertain', stage: 'validation' });
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
    ).resolves.toMatchObject({
      kind: 'terminal',
    });
  } finally {
    vi.useRealTimers();
  }
});

test('classifies a rejected handler result as a structured validation failure', async () => {
  const scenario = createScenario({
    handler: { execute: async () => ({ value: { echoed: 'invalid' } }) },
    resultSchema: {
      ...manualEchoResultSchema,
      validate: async () => ({
        ok: false,
        issues: [{ message: 'The result is not accepted.', path: ['echoed'] }],
      }),
    },
  });
  const { controller, input } = await prepareAttempt(scenario);

  await expect(
    scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    ),
  ).resolves.toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.validation.result',
      stage: 'handler',
      retryable: false,
    },
  });
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
});

test('rejects a restored attempt whose script identity is not a script key', async () => {
  const scenario = createScenario({
    handler: { execute: async () => ({ value: { echoed: 'must-not-run' } }) },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const malformed = structuredClone(input);
  Reflect.set(malformed.script, 'id', 'invalid-script-key');

  await expect(
    scenario.scripts.executeAttempt(
      malformed,
      executionContext(controller, async () => undefined),
    ),
  ).rejects.toMatchObject({ code: 'revo.script.validation.attempt' });
  expect(scenario.phases).toEqual([]);
});

test('reports uncertain event sink while started delivery is still running', async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: { execute: async () => ({ value: { echoed: 'never-called' } }) },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(
        controller,
        async () =>
          await new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toMatchObject({ kind: 'uncertain', stage: 'event_sink' });
    expect(scenario.phases).toEqual([]);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(
      scenario.scripts.reconcileAttempt(input, { signal: controller.signal }),
    ).resolves.toMatchObject({
      kind: 'terminal',
    });
  } finally {
    vi.useRealTimers();
  }
});

test('returns event-sink uncertainty for a live custom emission and seals only the late reconciled terminal event', async () => {
  vi.useFakeTimers();
  try {
    let release: (() => void) | undefined;
    const scenario = createScenario({
      timeoutMs: 25,
      handler: {
        execute: async (_input, context) => {
          void context.emit({ name: 'consumer.progress', details: { progress: 'queued' } });
          return { value: { echoed: 'ok' } };
        },
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const emitted: string[] = [];
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async (emission) => {
        emitted.push(emission.event.name);
        if (emission.event.name === 'consumer.progress') {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      }),
    );

    await vi.advanceTimersByTimeAsync(1_025);
    await expect(execution).resolves.toEqual({
      kind: 'uncertain',
      trigger: 'timeout',
      stage: 'event_sink',
      evidence: [],
    });
    expect(emitted).toEqual(['revo.script.started', 'consumer.progress']);

    release?.();
    await vi.advanceTimersByTimeAsync(0);
    const reconciled = await scenario.scripts.reconcileAttempt(input, {
      signal: controller.signal,
    });
    expect(reconciled).toMatchObject({
      kind: 'terminal',
      result: {
        kind: 'timedOut',
        terminalEvent: { event: { name: 'revo.script.timed_out' } },
      },
    });
    expect(emitted).toEqual(['revo.script.started', 'consumer.progress']);
  } finally {
    vi.useRealTimers();
  }
});

test('a consumer sink cannot observe or reject the sealed terminal event', async () => {
  const scenario = createScenario({
    handler: {
      execute: async (_input, context) => {
        await context.emit({
          name: 'consumer.progress',
          details: { secret: 'must-not-leave-the-package', progress: 'halfway' },
        });
        return { value: { echoed: 'hello' } };
      },
    },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const emissions: ScriptEventEmission[] = [];

  const result = await scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async (emission) => {
      emissions.push(emission);
      if (
        emission.event.name.startsWith('revo.script.') &&
        emission.event.name !== 'revo.script.started'
      ) {
        throw new Error('Terminal event must not reach the live sink.');
      }
    }),
  );

  expect(result).toMatchObject({ kind: 'succeeded', value: { echoed: 'hello' } });
  expectTerminalEvent(result, 'revo.script.succeeded', { evidenceCount: 0 });
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
  expect(emissions.map(({ emissionOrdinal, event }) => [emissionOrdinal, event.name])).toEqual([
    [1, 'revo.script.started'],
    [2, 'consumer.progress'],
  ]);
  expect(emissions[1]?.event).toEqual({
    name: 'consumer.progress',
    details: { secret: '[REDACTED]', progress: 'halfway' },
  });
});

test('cleanup failure replaces a wall-clock timeout', async () => {
  vi.useFakeTimers();
  try {
    let started: (() => void) | undefined;
    const scenario = createScenario({
      cleanupFails: true,
      timeoutMs: 25,
      handler: {
        execute: async (_input, context) =>
          await waitForAbort(context.signal, () => {
            started?.();
          }),
      },
    });
    const { controller, input } = await prepareAttempt(scenario);
    const execution = scenario.scripts.executeAttempt(
      input,
      executionContext(controller, async () => undefined),
    );
    await new Promise<void>((resolve) => {
      started = resolve;
    });

    await vi.advanceTimersByTimeAsync(25);

    const result = await execution;
    expect(result).toMatchObject({
      kind: 'failed',
      error: {
        code: 'revo.script.execution.cleanup',
        message: 'Provider resources could not be disposed safely.',
        retryable: false,
        stage: 'cleanup',
        details: null,
        causes: [{ kind: 'prior_outcome', outcome: 'timedOut' }],
      },
      evidence: [],
    });
    expectTerminalEvent(result, 'revo.script.failed', {
      code: 'revo.script.execution.cleanup',
      stage: 'cleanup',
      retryable: false,
    });
    expect(scenario.phases).toEqual(['handler', 'cleanup']);
  } finally {
    vi.useRealTimers();
  }
});

test('an active cancellation remains unknown until completion and seals a cancelled terminal event', async () => {
  let started: (() => void) | undefined;
  const scenario = createScenario({
    handler: {
      execute: async (_input, context) =>
        await waitForAbort(context.signal, () => {
          started?.();
        }),
    },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const emissions: ScriptEventEmission[] = [];
  const execution = scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async (emission) => {
      emissions.push(emission);
    }),
  );
  await new Promise<void>((resolve) => {
    started = resolve;
  });

  expect(
    await scenario.scripts.cancelAttempt(
      { executionId: input.executionId, attemptId: input.attemptId },
      { signal: controller.signal },
    ),
  ).toEqual({ kind: 'unknown' });
  expect(await scenario.scripts.reconcileAttempt(input, { signal: controller.signal })).toEqual({
    kind: 'unknown',
  });
  const result = await execution;
  expect(result).toMatchObject({ kind: 'cancelled', evidence: [] });
  expectTerminalEvent(result, 'revo.script.cancelled');
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
  expect(emissions.map(({ emissionOrdinal, event }) => [emissionOrdinal, event.name])).toEqual([
    [1, 'revo.script.started'],
  ]);
});

test('cleanup remains primary when terminal event sealing does not call the sink', async () => {
  const scenario = createScenario({
    cleanupFails: true,
    handler: {
      execute: async () => {
        throw new ScriptFault('revo.script.provider.transient', 'Provider failed.', {
          retryable: true,
        });
      },
    },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const emissions: ScriptEventEmission[] = [];

  const result = await scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async (emission) => {
      emissions.push(emission);
    }),
  );

  expect(result).toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.execution.cleanup',
      message: 'Provider resources could not be disposed safely.',
      retryable: false,
      stage: 'cleanup',
      details: null,
      causes: [{ kind: 'fault', code: 'revo.script.provider.transient', stage: 'provider' }],
    },
    evidence: [],
  });
  expectTerminalEvent(result, 'revo.script.failed', {
    code: 'revo.script.execution.cleanup',
    stage: 'cleanup',
    retryable: false,
  });
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
  expect(emissions.map(({ emissionOrdinal, event }) => [emissionOrdinal, event.name])).toEqual([
    [1, 'revo.script.started'],
  ]);
});

test('a rejected custom event still disposes acquired resources without a recursive terminal event', async () => {
  const scenario = createScenario({
    handler: {
      execute: async (_input, context) => {
        await context.emit({
          name: 'consumer.progress',
          details: { secret: 'must-not-leave-the-package' },
        });
        return { value: { echoed: 'hello' } };
      },
    },
  });
  const { controller, input } = await prepareAttempt(scenario);
  const emissions: ScriptEventEmission[] = [];

  const result = await scenario.scripts.executeAttempt(
    input,
    executionContext(controller, async (emission) => {
      emissions.push(emission);
      if (emission.event.name === 'consumer.progress') {
        throw new Error('Custom event rejected.');
      }
    }),
  );

  expect(result).toMatchObject({
    kind: 'failed',
    error: {
      code: 'revo.script.execution.event_sink',
      stage: 'event_sink',
      retryable: false,
    },
  });
  expect(scenario.phases).toEqual(['handler', 'cleanup']);
  expect(emissions.map(({ emissionOrdinal, event }) => [emissionOrdinal, event.name])).toEqual([
    [1, 'revo.script.started'],
    [2, 'consumer.progress'],
  ]);
});

test('rejects control characters in control-plane attempt identities before state lookup', async () => {
  const scenario = createScenario({
    handler: { execute: async () => ({ value: { echoed: 'unused' } }) },
  });
  const controller = new AbortController();

  await expect(
    scenario.scripts.cancelAttempt(
      { executionId: 'run\u0000bad', attemptId: 'attempt' },
      { signal: controller.signal },
    ),
  ).rejects.toMatchObject({ code: 'revo.script.validation.attempt' });
  expect(scenario.scripts.listManifests()).toHaveLength(1);
  expect(scenario.scripts.listProviderImplementations()).toHaveLength(1);
  const malformedContext = { signal: controller.signal };
  Reflect.set(malformedContext, 'signal', null);
  await expect(
    scenario.scripts.cancelAttempt({ executionId: 'run', attemptId: 'attempt' }, malformedContext),
  ).rejects.toMatchObject({ code: 'revo.script.validation.attempt' });
});
