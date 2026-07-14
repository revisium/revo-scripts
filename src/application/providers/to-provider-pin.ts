import type { ScriptProviderModule } from '../../host/providers/script-provider-module.js';
import type { ScriptProviderRequirement } from '../../runtime/spec/manifest/index.js';
import type { ScriptProviderPin } from '../contracts/script-provider-pin.js';

export const toProviderPin = (
  requirement: ScriptProviderRequirement,
  provider: ScriptProviderModule,
): ScriptProviderPin => ({
  name: requirement.name,
  resource: requirement.resource,
  id: provider.id,
  contract: provider.contract,
  implementationDigest: provider.implementationDigest,
  workspace: provider.workspace,
  provenance: { ...provider.provenance },
});
