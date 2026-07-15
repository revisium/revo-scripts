import type { ScriptDefinition } from '../../spec/definition/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import { registeredScriptBrand, type RegisteredScript } from '../contracts/registered-script.js';
import { readRegisteredScriptDefinition } from './read-registered-script-definition.js';

export class RegisteredScriptHandle<I, O, R extends ScriptResourceMap> implements RegisteredScript<
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
  readonly implementation: Readonly<{
    id: string;
    version: string;
    buildDigest: `sha256:${string}`;
  }>;
  private readonly definition: ScriptDefinition<I, O, R>;

  constructor(definition: ScriptDefinition<I, O, R>) {
    this.manifest = definition.manifest;
    this.definitionDigest = definition.definitionDigest;
    this.implementation = definition.implementation;
    this.definition = definition;
    // The executable definition is intentionally absent from the public handle shape.
    Object.defineProperty(this, 'definition', { enumerable: false });
  }

  [readRegisteredScriptDefinition](): ScriptDefinition<I, O, R> {
    return this.definition;
  }
}
