import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptPayloadKind } from './script-payload-kind.js';

const jsonCompatibilityCode = (kind: ScriptPayloadKind) => {
  if (kind === 'event') {
    return 'revo.script.validation.event' as const;
  }

  return kind === 'input' || kind === 'bindings'
    ? ('revo.script.validation.input' as const)
    : ('revo.script.validation.result' as const);
};

export const serializeScriptJson = (value: unknown, kind: ScriptPayloadKind): string => {
  try {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      throw new TypeError('Value has no JSON representation');
    }

    return serialized;
  } catch (cause: unknown) {
    throw new ScriptFault(jsonCompatibilityCode(kind), `Script ${kind} must be JSON-compatible.`, {
      cause,
    });
  }
};
