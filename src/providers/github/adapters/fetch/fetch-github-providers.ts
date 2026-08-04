import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import type { FetchGitHubProviderOptions } from './fetch-github-provider-options.js';
import { FetchGitHubProvider } from './fetch-github-provider.js';

const fetchGitHubProviderImplementationDigest =
  'sha256:9c8081e0fca0809354e0bde46fa8db6a6740b23e38b070a3123ced4438d9826a' as const;

export const fetchGitHubProviders = (
  options: FetchGitHubProviderOptions = {},
): readonly ScriptProviderRegistration[] => [
  { module: new FetchGitHubProvider(options, fetchGitHubProviderImplementationDigest) },
];
