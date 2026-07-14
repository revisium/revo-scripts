import type { ResolvedCredential } from '../../../host/credentials/resolved-credential.js';
import type { PreparedProviderClients } from '../../../host/providers/prepared-provider-clients.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';

export const disposeProviderResources = async (
  providers: readonly PreparedProviderClients[],
  credentials: readonly ResolvedCredential[],
): Promise<void> => {
  const results = await Promise.allSettled([
    ...providers.map((provider) => Promise.resolve().then(() => provider.dispose())),
    ...credentials.map((credential) => Promise.resolve().then(() => credential.dispose())),
  ]);

  if (results.some((result) => result.status === 'rejected')) {
    throw new ScriptFault(
      'revo.script.provider.cleanup_failed',
      'Provider resources could not be disposed safely.',
    );
  }
};
