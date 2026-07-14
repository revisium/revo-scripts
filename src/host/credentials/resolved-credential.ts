export interface ResolvedCredential {
  readonly alias: string;
  readonly provider: string;
  readonly secret: string;
  dispose(): Promise<void>;
}
