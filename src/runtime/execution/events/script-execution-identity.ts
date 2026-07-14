import type { ScriptManifestV1 } from '../../spec/manifest/index.js';

export interface ScriptExecutionIdentity {
  readonly manifest: ScriptManifestV1;
  readonly definitionDigest: `sha256:${string}`;
}
