import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { RegisteredScript } from '../contracts/registered-script.js';
import type { ScriptRegistry } from '../contracts/script-registry.js';
import type { UnknownRegisteredScript } from '../contracts/unknown-registered-script.js';
import { compareManifests } from './compare-manifests.js';
import { definitionKey } from './definition-key.js';
import { readRegisteredScriptDefinition } from './read-registered-script-definition.js';
import { RegisteredScriptHandle } from './registered-script-handle.js';

export class DefaultScriptRegistry implements ScriptRegistry {
  private readonly entries = new Map<string, UnknownRegisteredScript>();
  private readonly handles = new WeakSet<object>();
  private sealed = false;

  register<I, O, R extends ScriptResourceMap>(
    definition: ScriptDefinition<I, O, R>,
  ): RegisteredScript<I, O, R> {
    if (this.sealed) {
      throw new ScriptFault('revo.script.execution.registry_sealed', 'Script registry is sealed.');
    }

    const key = definitionKey(definition.manifest.id, definition.manifest.version);

    if (this.entries.has(key)) {
      throw new ScriptFault(
        'revo.script.execution.duplicate_definition',
        `Script definition ${definition.manifest.id}@${definition.manifest.version} is already registered.`,
      );
    }

    const handle = new RegisteredScriptHandle(definition);
    this.entries.set(key, handle);
    this.handles.add(handle);
    return handle;
  }

  seal(): void {
    this.sealed = true;
  }

  resolve(id: string, version: number): RegisteredScript<unknown, unknown, ScriptResourceMap> {
    this.requireSealed();
    const revision = validateScriptRevision(version);
    const handle = this.entries.get(definitionKey(id, revision));

    if (handle === undefined) {
      throw new ScriptFault(
        'revo.script.execution.definition_missing',
        `Script definition ${id}@${version} is not registered.`,
      );
    }

    return handle;
  }

  getExact(
    id: string,
    version: number,
    digest: `sha256:${string}`,
  ): RegisteredScript<unknown, unknown, ScriptResourceMap> {
    const handle = this.resolve(id, version);

    if (handle.definitionDigest !== digest) {
      throw new ScriptFault(
        'revo.script.execution.digest_mismatch',
        'Script definition digest does not match the registered definition.',
      );
    }

    return handle;
  }

  listManifests(): readonly ScriptManifestV1[] {
    return [...this.entries.values()].map((entry) => entry.manifest).sort(compareManifests);
  }

  readDefinition<I, O, R extends ScriptResourceMap>(
    script: RegisteredScript<I, O, R>,
  ): ScriptDefinition<I, O, R> {
    this.requireSealed();

    if (!this.handles.has(script) || !isRegisteredHandle(script)) {
      throw new ScriptFault(
        'revo.script.execution.definition_missing',
        'Registered script handle does not belong to this registry.',
      );
    }

    const resolved = this.entries.get(definitionKey(script.manifest.id, script.manifest.version));

    if (resolved !== script) {
      throw new ScriptFault(
        'revo.script.execution.definition_missing',
        'Registered script handle is no longer valid.',
      );
    }

    return script[readRegisteredScriptDefinition]();
  }

  private requireSealed(): void {
    if (!this.sealed) {
      throw new ScriptFault(
        'revo.script.execution.registry_not_sealed',
        'Script registry must be sealed before lookup.',
      );
    }
  }
}

const isRegisteredHandle = <I, O, R extends ScriptResourceMap>(
  script: RegisteredScript<I, O, R>,
): script is RegisteredScriptHandle<I, O, R> => script instanceof RegisteredScriptHandle;

const validateScriptRevision = (revision: unknown): number => {
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Script revision must be a positive safe integer.',
    );
  }

  return revision;
};
