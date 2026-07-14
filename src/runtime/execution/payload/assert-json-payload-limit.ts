import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptPayloadKind } from './script-payload-kind.js';
import { serializeScriptJson } from './serialize-script-json.js';

const payloadLimitBytes = 1_048_576;

export const assertJsonPayloadWithinLimit = (value: unknown, kind: ScriptPayloadKind): void => {
  const actualBytes = Buffer.byteLength(serializeScriptJson(value, kind), 'utf8');

  if (actualBytes > payloadLimitBytes) {
    throw new ScriptFault(
      'revo.script.validation.payload_limit',
      `Script ${kind} exceeds the ${payloadLimitBytes}-byte JSON payload limit.`,
      { details: { kind, limitBytes: payloadLimitBytes, actualBytes } },
    );
  }
};
