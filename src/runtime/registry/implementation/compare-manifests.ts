import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
export const compareManifests = (left: ScriptManifestV1, right: ScriptManifestV1): number => {
  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return left.version - right.version;
};
