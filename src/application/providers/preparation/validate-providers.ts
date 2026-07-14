import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import { requireBinding } from '../../bindings/require-binding.js';
import type { RevoScriptExecutionRequest } from '../../contracts/revo-script-execution-request.js';
import type { ProviderCatalog } from '../provider-catalog.js';
import type { ValidatedProvider } from './validated-provider.js';

export const validateProviders = (
  catalog: ProviderCatalog,
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
): readonly ValidatedProvider[] =>
  manifest.providers.map((requirement) => {
    const resource = manifest.resources.find(
      (candidate) => candidate.name === requirement.resource,
    );

    if (resource === undefined) {
      throw new ScriptFault(
        'revo.script.validation.manifest',
        'Provider requirement references an unknown resource.',
      );
    }

    const pin = request.providers.find((candidate) => candidate.name === requirement.name);
    return {
      requirement,
      resource,
      binding: requireBinding(request, manifest, resource),
      provider: catalog.requireProvider(requirement, pin),
    };
  });
