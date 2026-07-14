import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { RegisteredScript } from './registered-script.js';

export type UnknownRegisteredScript = RegisteredScript<unknown, unknown, ScriptResourceMap>;
