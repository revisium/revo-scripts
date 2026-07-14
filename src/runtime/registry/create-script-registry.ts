import type { ScriptRegistry } from './contracts/script-registry.js';
import { DefaultScriptRegistry } from './implementation/default-script-registry.js';

export const createScriptRegistry = (): ScriptRegistry => new DefaultScriptRegistry();
