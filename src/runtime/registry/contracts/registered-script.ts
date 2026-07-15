import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';

export const registeredScriptBrand: unique symbol = Symbol('revo.registered-script');

export interface RegisteredScript<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
  readonly implementation: Readonly<{
    id: string;
    version: string;
    buildDigest: `sha256:${string}`;
  }>;
  readonly [registeredScriptBrand]: {
    readonly input: I;
    readonly output: O;
    readonly resources: R;
  };
}
