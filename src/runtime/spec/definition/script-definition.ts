import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptDefinitionInput } from './script-definition-input.js';

export interface ScriptDefinition<I, O, R extends ScriptResourceMap> extends ScriptDefinitionInput<
  I,
  O,
  R
> {
  readonly definitionDigest: `sha256:${string}`;
}
