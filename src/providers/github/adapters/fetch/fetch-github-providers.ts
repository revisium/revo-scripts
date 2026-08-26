import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import type { FetchGitHubProviderOptions } from './fetch-github-provider-options.js';
import { FetchGitHubProvider } from './fetch-github-provider.js';

const fetchGitHubProviderImplementationDigest =
  'sha256:30cf672ff8e4c5fb2662284e3ca1d93297a5f75a720ec3c7932384a74b808dd4' as const;

export const fetchGitHubProviders = (
  options: FetchGitHubProviderOptions = {},
): readonly ScriptProviderRegistration[] => [
  { module: new FetchGitHubProvider(options, fetchGitHubProviderImplementationDigest) },
];
