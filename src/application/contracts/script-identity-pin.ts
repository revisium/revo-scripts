export interface ScriptIdentityPin {
  readonly id: `script:${string}`;
  readonly version: string;
  readonly definitionDigest: `sha256:${string}`;
}
