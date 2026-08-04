import { builtInDefinitionInventory } from './built-in-definition-inventory.js';
import type { BuiltInScriptDescriptor } from './built-in-script-descriptor.js';

const descriptors = builtInDefinitionInventory
  .map(
    (definition): BuiltInScriptDescriptor =>
      Object.freeze({
        script: Object.freeze({
          id: definition.manifest.id,
          version: definition.manifest.version,
        }),
        implementation: Object.freeze({ ...definition.implementation }),
      }),
  )
  .sort((left, right) =>
    left.script.id === right.script.id
      ? left.script.version - right.script.version
      : left.script.id.localeCompare(right.script.id),
  );

export const builtInScriptCatalog = (): readonly BuiltInScriptDescriptor[] =>
  Object.freeze([...descriptors]);
