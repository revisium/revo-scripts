import type { ScriptIdentityPin } from '../contracts/script-identity-pin.js';

export interface BuiltInScriptDescriptor {
  readonly script: ScriptIdentityPin;
  readonly implementation: Readonly<{
    id: string;
    version: string;
    buildDigest: `sha256:${string}`;
  }>;
}
