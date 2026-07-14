import type { ScriptDefinition } from '../../spec/definition/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { RegisteredScript } from './registered-script.js';

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
