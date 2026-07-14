import type { PreparedProviderClients } from '../../../host/providers/prepared-provider-clients.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';

export const mergeProviderClients = (
  clientsByResource: Map<string, Record<string, object>>,
  resource: string,
  prepared: PreparedProviderClients,
): void => {
  const target = clientsByResource.get(resource);

  if (target === undefined) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Provider references unknown resource ${resource}.`,
    );
  }

  Object.entries(prepared.clients).forEach(([name, client]) => {
    if (Object.hasOwn(target, name)) {
      throw new ScriptFault(
        'revo.script.provider.client_conflict',
        `Provider client ${name} is already attached to resource ${resource}.`,
      );
    }

    target[name] = client;
  });
};
