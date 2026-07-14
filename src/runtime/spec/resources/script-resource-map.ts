import type { ScriptResourceHandle } from './script-resource-handle.js';

export type ScriptResourceMap = Readonly<Record<string, ScriptResourceHandle<object>>>;
