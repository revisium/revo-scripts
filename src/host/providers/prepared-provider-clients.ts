export interface PreparedProviderClients {
  readonly clients: Readonly<Record<string, object>>;
  dispose(): Promise<void>;
}
