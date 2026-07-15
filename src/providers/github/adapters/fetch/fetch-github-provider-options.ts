export interface FetchGitHubProviderOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly apiBaseUrl?: string;
  readonly graphqlUrl?: string;
  readonly userAgent?: string;
  /** Testable observation clock; default is the provider process clock. */
  readonly now?: () => Date;
}
