import type { ScriptCustomEvent } from './script-custom-event.js';
import type { ScriptLifecycleEvent } from './script-lifecycle-event.js';

export type ScriptEvent = ScriptLifecycleEvent | ScriptCustomEvent;
