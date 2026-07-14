import type { ScriptProviderRegistration } from '../../../../host/providers/script-provider-registration.js';
import type { FetchGitHubProviderOptions } from './fetch-github-provider-options.js';
import { FetchGitHubProvider } from './fetch-github-provider.js';

export const fetchGitHubProviders = (
  options: FetchGitHubProviderOptions = {},
): readonly ScriptProviderRegistration[] => [
  { module: new FetchGitHubProvider(options), useForNewPlans: true },
];
