import { ScriptFault } from '../spec/script-errors.js';
import { codePointLength } from './validation-rules.js';

const payloadLimitBytes = 1_048_576;
const eventLimitBytes = 65_536;
const evidenceLimit = 64;
const evidenceRefLimit = 2_048;
const evidenceSummaryLimit = 4_096;

export type ScriptPayloadKind = 'input' | 'bindings' | 'result' | 'event';

const jsonCompatibilityCode = (kind: ScriptPayloadKind) => {
  if (kind === 'event') {
    return 'revo.script.validation.event' as const;
  }

  return kind === 'input' || kind === 'bindings'
    ? ('revo.script.validation.input' as const)
    : ('revo.script.validation.result' as const);
};

const serializeJson = (value: unknown, kind: ScriptPayloadKind): string => {
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

export const assertJsonPayloadWithinLimit = (value: unknown, kind: ScriptPayloadKind): void => {
  const actualBytes = Buffer.byteLength(serializeJson(value, kind), 'utf8');

  if (actualBytes > payloadLimitBytes) {
    throw new ScriptFault(
      'revo.script.validation.payload_limit',
      `Script ${kind} exceeds the ${payloadLimitBytes}-byte JSON payload limit.`,
      { details: { kind, limitBytes: payloadLimitBytes, actualBytes } },
    );
  }
};

export const assertEventWithinLimit = (event: unknown): void => {
  const actualBytes = Buffer.byteLength(serializeJson(event, 'event'), 'utf8');

  if (actualBytes > eventLimitBytes) {
    throw new ScriptFault(
      'revo.script.validation.payload_limit',
      `Script event exceeds the ${eventLimitBytes}-byte JSON payload limit.`,
      { details: { kind: 'event', limitBytes: eventLimitBytes, actualBytes } },
    );
  }
};

export const validateEvidence = (
  evidence: readonly Readonly<{ kind: string; ref: string; summary?: string }>[],
): void => {
  if (evidence.length > evidenceLimit) {
    throw new ScriptFault(
      'revo.script.validation.payload_limit',
      `Script evidence exceeds the ${evidenceLimit}-item limit.`,
      { details: { kind: 'evidence', limit: evidenceLimit, actual: evidence.length } },
    );
  }

  evidence.forEach((item, index) => {
    if (codePointLength(item.ref) > evidenceRefLimit) {
      throw new ScriptFault(
        'revo.script.validation.payload_limit',
        `Script evidence ref exceeds the ${evidenceRefLimit}-code-point limit.`,
        { details: { kind: 'evidence.ref', index, limit: evidenceRefLimit } },
      );
    }

    if (item.summary !== undefined && codePointLength(item.summary) > evidenceSummaryLimit) {
      throw new ScriptFault(
        'revo.script.validation.payload_limit',
        `Script evidence summary exceeds the ${evidenceSummaryLimit}-code-point limit.`,
        { details: { kind: 'evidence.summary', index, limit: evidenceSummaryLimit } },
      );
    }
  });
};
