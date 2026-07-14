import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import { definitionKey } from './definition-key.js';

export const compareManifests = (left: ScriptManifestV1, right: ScriptManifestV1): number => {
  const leftKey = definitionKey(left.id, left.version);
  const rightKey = definitionKey(right.id, right.version);

  if (leftKey < rightKey) {
    return -1;
  }

  if (leftKey > rightKey) {
    return 1;
  }

  return 0;
};
