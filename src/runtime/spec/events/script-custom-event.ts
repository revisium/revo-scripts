import type { JsonObject } from '../json/json-value.js';

export interface ScriptCustomEvent {
  readonly name: string;
  readonly details?: JsonObject;
}
