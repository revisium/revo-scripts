import { ScriptFault } from '../../spec/errors/index.js';
import { serializeScriptJson } from './serialize-script-json.js';

const eventLimitBytes = 65_536;

export const assertEventWithinLimit = (event: unknown): void => {
  const actualBytes = Buffer.byteLength(serializeScriptJson(event, 'event'), 'utf8');

  if (actualBytes > eventLimitBytes) {
    throw new ScriptFault(
      'revo.script.validation.payload_limit',
      `Script event exceeds the ${eventLimitBytes}-byte JSON payload limit.`,
      { details: { kind: 'event', limitBytes: eventLimitBytes, actualBytes } },
    );
  }
};
