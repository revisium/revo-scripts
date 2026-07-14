import type { ExecuteScriptRequest } from '../../spec/execution/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import { validateIdempotencyKey } from './validate-idempotency-key.js';
import { validateResources } from './validate-resources.js';

export const validateExecutionRequest = <R extends ScriptResourceMap>(
  manifest: ScriptManifestV1,
  request: ExecuteScriptRequest<R>,
): void => {
  validateResources(manifest, request.resources);
  validateIdempotencyKey(manifest, request.idempotencyKey);
};
