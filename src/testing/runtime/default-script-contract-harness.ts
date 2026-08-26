import type { ScriptEvent } from '../../application/contracts/script-attempt.js';
import { createRevoScripts } from '../../application/create-revo-scripts.js';
import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptCustomEvent } from '../../runtime/spec/events/script-custom-event.js';
import type { JsonValue } from '../../runtime/spec/json/json-value.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ScriptContractExecution } from './script-contract-execution.js';
import type { ScriptContractHarnessOptions } from './script-contract-harness-options.js';
import type { ScriptContractHarness } from './script-contract-harness.js';

export class DefaultScriptContractHarness<
  I,
  O,
  R extends ScriptResourceMap,
> implements ScriptContractHarness {
  private readonly definition: ScriptDefinition<I, O, R>;
  private readonly options: ScriptContractHarnessOptions;

  constructor(definition: ScriptDefinition<I, O, R>, options: ScriptContractHarnessOptions) {
    this.definition = definition;
    this.options = options;
  }

  async runAttempt(input: unknown): Promise<ScriptContractExecution> {
    if (!isJsonValue(input)) {
      throw new ScriptFault('revo.script.validation.input', 'Script input is not JSON-compatible.');
    }
    const controller = new AbortController();
    const scripts = createRevoScripts({
      definitions: [
        {
          id: this.definition.implementation.id,
          provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0-test' },
          registerInto: (registrar) => registrar.register(this.definition),
        },
      ],
      providers: [],
      host: pureContractHarnessHost,
    });
    const binding = await scripts.prepareBinding(
      {
        script: { id: this.definition.manifest.id, version: this.definition.manifest.version },
        resources: {},
        credentials: {},
      },
      { signal: controller.signal },
    );
    const observed: ScriptEvent[] = [];
    const result = await scripts.executeAttempt(
      {
        executionId: this.options.executionId ?? 'script-contract-execution',
        attemptId: 'script-contract-attempt-1',
        attemptOrdinal: 1,
        script: binding.script,
        binding,
        input,
      },
      {
        signal: controller.signal,
        events: {
          emit: async (emission) => {
            observed.push(emission.event);
          },
        },
      },
    );
    const events = observed.filter(isCustomEvent);
    return result.kind === 'succeeded'
      ? { result, events, value: result.value }
      : { result, events };
  }
}

const unavailable = async (): Promise<never> => {
  throw new Error('The pure contract harness has no live host resources.');
};

export const pureContractHarnessHost = {
  resources: { inspect: async () => undefined },
  workspaces: {
    inspect: async () => undefined,
    acquire: unavailable,
  },
  credentials: {
    inspect: async () => undefined,
    acquire: unavailable,
  },
};

const isCustomEvent = (event: ScriptEvent): event is ScriptCustomEvent =>
  !event.name.startsWith('revo.script.');

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return typeof value === 'object' && value !== null && Object.values(value).every(isJsonValue);
};
