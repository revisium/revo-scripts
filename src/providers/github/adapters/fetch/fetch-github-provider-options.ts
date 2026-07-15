export interface FetchGitHubProviderOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly apiBaseUrl?: string;
  readonly graphqlUrl?: string;
  readonly userAgent?: string;
}
