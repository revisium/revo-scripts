import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';
import { requireBinding } from '../../bindings/require-binding.js';
import type { RevoScriptExecutionRequest } from '../../contracts/revo-script-execution-request.js';

export const createScriptResources = (
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
  clientsByResource: ReadonlyMap<string, Record<string, object>>,
): Record<string, ScriptResourceHandle<object>> => {
  const resources: Record<string, ScriptResourceHandle<object>> = {};

  manifest.resources.forEach((requirement) => {
    const binding = requireBinding(request, manifest, requirement);
    resources[requirement.name] = {
      name: requirement.name,
      kind: requirement.kind,
      access: requirement.access,
      grant: binding.grant,
      clients: clientsByResource.get(requirement.name) ?? {},
    };
  });

  return resources;
};
