export interface ScriptImplementationIdentity {
  readonly id: string;
  readonly version: string;
  /** Exact digest of the executable closure selected for this definition. */
  readonly buildDigest: `sha256:${string}`;
}
