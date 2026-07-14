import type { ScriptDefinition } from '../spec/script-definition.js';
import { ScriptFault } from '../spec/script-errors.js';
import type { ScriptManifestV1 } from '../spec/script-manifest.js';
import type { ScriptResourceMap } from '../spec/script-resources.js';

declare const registeredScriptBrand: unique symbol;
const readDefinition = Symbol('readRegisteredScriptDefinition');

export interface RegisteredScript<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
  readonly implementation: Readonly<{ id: string; version: string }>;
  readonly [registeredScriptBrand]: {
    readonly input: I;
    readonly output: O;
    readonly resources: R;
  };
}

export interface ScriptRegistry {
  register<I, O, R extends ScriptResourceMap>(
    definition: ScriptDefinition<I, O, R>,
  ): RegisteredScript<I, O, R>;
  seal(): void;
  resolve(id: string, version: string): RegisteredScript<unknown, unknown, ScriptResourceMap>;
  getExact(
    id: string,
    version: string,
    digest: `sha256:${string}`,
  ): RegisteredScript<unknown, unknown, ScriptResourceMap>;
  listManifests(): readonly ScriptManifestV1[];
}

class RegisteredScriptHandle<I, O, R extends ScriptResourceMap> implements RegisteredScript<
  I,
  O,
  R
> {
  declare readonly [registeredScriptBrand]: {
    readonly input: I;
    readonly output: O;
    readonly resources: R;
  };

  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
  readonly implementation: Readonly<{ id: string; version: string }>;
  readonly #definition: ScriptDefinition<I, O, R>;

  constructor(definition: ScriptDefinition<I, O, R>) {
    this.manifest = definition.manifest;
    this.definitionDigest = definition.definitionDigest;
    this.implementation = definition.implementation;
    this.#definition = definition;
    Object.freeze(this);
  }

  [readDefinition](): ScriptDefinition<I, O, R> {
    return this.#definition;
  }
}

type UnknownRegisteredScript = RegisteredScript<unknown, unknown, ScriptResourceMap>;

interface RegistryState {
  readonly entries: Map<string, UnknownRegisteredScript>;
  readonly handles: WeakSet<object>;
  sealed: boolean;
}

const registryStates = new WeakMap<ScriptRegistry, RegistryState>();

const definitionKey = (id: string, version: string): string => `${id}\u0000${version}`;

const requireState = (registry: ScriptRegistry): RegistryState => {
  const state = registryStates.get(registry);

  if (state === undefined) {
    throw new ScriptFault(
      'revo.script.execution.definition_missing',
      'Script registry instance is not recognized.',
    );
  }

  return state;
};

const requireSealed = (state: RegistryState): void => {
  if (!state.sealed) {
    throw new ScriptFault(
      'revo.script.execution.registry_not_sealed',
      'Script registry must be sealed before lookup.',
    );
  }
};

const compareManifests = (left: ScriptManifestV1, right: ScriptManifestV1): number => {
  const leftKey = definitionKey(left.id, left.version);
  const rightKey = definitionKey(right.id, right.version);

  if (leftKey < rightKey) {
    return -1;
  }

  if (leftKey > rightKey) {
    return 1;
  }

  return 0;
};

const isRegisteredHandle = <I, O, R extends ScriptResourceMap>(
  script: RegisteredScript<I, O, R>,
): script is RegisteredScriptHandle<I, O, R> => script instanceof RegisteredScriptHandle;

export const createScriptRegistry = (): ScriptRegistry => {
  const state: RegistryState = {
    entries: new Map(),
    handles: new WeakSet(),
    sealed: false,
  };

  const registry: ScriptRegistry = {
    register: <I, O, R extends ScriptResourceMap>(definition: ScriptDefinition<I, O, R>) => {
      if (state.sealed) {
        throw new ScriptFault(
          'revo.script.execution.registry_sealed',
          'Script registry is sealed.',
        );
      }

      const key = definitionKey(definition.manifest.id, definition.manifest.version);

      if (state.entries.has(key)) {
        throw new ScriptFault(
          'revo.script.execution.duplicate_definition',
          `Script definition ${definition.manifest.id}@${definition.manifest.version} is already registered.`,
        );
      }

      const handle = new RegisteredScriptHandle(definition);
      state.entries.set(key, handle);
      state.handles.add(handle);
      return handle;
    },
    seal: () => {
      state.sealed = true;
    },
    resolve: (id, version) => {
      requireSealed(state);
      const handle = state.entries.get(definitionKey(id, version));

      if (handle === undefined) {
        throw new ScriptFault(
          'revo.script.execution.definition_missing',
          `Script definition ${id}@${version} is not registered.`,
        );
      }

      return handle;
    },
    getExact: (id, version, digest) => {
      const handle = registry.resolve(id, version);

      if (handle.definitionDigest !== digest) {
        throw new ScriptFault(
          'revo.script.execution.digest_mismatch',
          'Script definition digest does not match the registered definition.',
        );
      }

      return handle;
    },
    listManifests: () =>
      Object.freeze(
        [...state.entries.values()].map((entry) => entry.manifest).sort(compareManifests),
      ),
  };

  registryStates.set(registry, state);
  return Object.freeze(registry);
};

export const getRegisteredDefinition = <I, O, R extends ScriptResourceMap>(
  registry: ScriptRegistry,
  script: RegisteredScript<I, O, R>,
): ScriptDefinition<I, O, R> => {
  const state = requireState(registry);
  requireSealed(state);

  if (!state.handles.has(script) || !isRegisteredHandle(script)) {
    throw new ScriptFault(
      'revo.script.execution.definition_missing',
      'Registered script handle does not belong to this registry.',
    );
  }

  const resolved = state.entries.get(definitionKey(script.manifest.id, script.manifest.version));

  if (resolved !== script) {
    throw new ScriptFault(
      'revo.script.execution.definition_missing',
      'Registered script handle is no longer valid.',
    );
  }

  return script[readDefinition]();
};
