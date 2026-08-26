import type { CredentialLease } from '../../host/credentials/resolved-credential.js';
import type { PreparedProviderClients } from '../../host/providers/prepared-provider-clients.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';

export class AcquiredAttemptResources {
  readonly resources: ScriptResourceMap;
  private readonly providers: readonly PreparedProviderClients[];
  private readonly credentials: readonly CredentialLease[];

  constructor(
    resources: ScriptResourceMap,
    providers: readonly PreparedProviderClients[],
    credentials: readonly CredentialLease[],
  ) {
    this.resources = resources;
    this.providers = [...providers];
    this.credentials = [...credentials];
  }

  async dispose(): Promise<void> {
    await disposeAll(this.providers, this.credentials);
  }
}

export const disposeAll = async (
  providers: readonly PreparedProviderClients[],
  credentials: readonly CredentialLease[],
): Promise<void> => {
  const settled = await Promise.allSettled([
    ...providers.map(async (provider) => await provider.dispose()),
    ...credentials.map(async (credential) => await credential.dispose()),
  ]);
  if (settled.some((result) => result.status === 'rejected')) {
    throw new ScriptFault(
      'revo.script.execution.cleanup',
      'Provider resources could not be disposed safely.',
    );
  }
};
