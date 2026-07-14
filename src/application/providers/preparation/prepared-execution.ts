import type { ResolvedCredential } from '../../../host/credentials/resolved-credential.js';
import type { PreparedProviderClients } from '../../../host/providers/prepared-provider-clients.js';
import type { ScriptDeadline } from '../../../runtime/execution/deadline/script-deadline.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { ScriptResourceMap } from '../../../runtime/spec/resources/index.js';
import { disposeProviderResources } from './dispose-provider-resources.js';

const cleanupGraceMs = 1_000;

export class PreparedExecution {
  readonly resources: ScriptResourceMap;
  private readonly providers: readonly PreparedProviderClients[];
  private readonly credentials: readonly ResolvedCredential[];

  constructor(
    resources: ScriptResourceMap,
    providers: readonly PreparedProviderClients[],
    credentials: readonly ResolvedCredential[],
  ) {
    this.resources = resources;
    this.providers = [...providers];
    this.credentials = [...credentials];
  }

  async dispose(deadline: ScriptDeadline): Promise<void> {
    const remainingMs = deadline.remainingMs();
    const budgetMs = remainingMs === 0 ? cleanupGraceMs : Math.min(remainingMs, cleanupGraceMs);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new ScriptFault(
              'revo.script.provider.cleanup_failed',
              'Provider cleanup exceeded its bounded grace period.',
            ),
          ),
        budgetMs,
      );
    });

    try {
      await Promise.race([disposeProviderResources(this.providers, this.credentials), budget]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
