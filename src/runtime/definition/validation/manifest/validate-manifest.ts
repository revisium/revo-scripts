import { ScriptFault } from '../../../spec/errors/index.js';
import type { ScriptManifestV1 } from '../../../spec/manifest/index.js';
import { validateManifestPolicy } from './manifest-policy.js';
import { validateManifestShape } from './manifest-shape-validator.js';

export const validateScriptManifest = (value: unknown): ScriptManifestV1 => {
  const manifest = validateManifestShape(value);
  const issues = validateManifestPolicy(manifest);

  if (issues.length > 0) {
    throw new ScriptFault('revo.script.validation.manifest', 'Script manifest is invalid.', {
      details: { issues },
    });
  }

  return manifest;
};
