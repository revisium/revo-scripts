import type { ScriptDefinition } from '../../spec/definition/index.js';
import type { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptFailure } from '../../spec/result/index.js';
import { assertEventWithinLimit } from '../payload/assert-event-limit.js';
import { redactValue } from '../redaction/redact.js';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const redactFailureDetails = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  try {
    const redacted = redactValue(details, definition.manifest.redaction.errorPaths);
    const projected = isRecord(redacted) ? redacted : { value: redacted };
    assertEventWithinLimit({ details: projected });
    return projected;
  } catch {
    return { redacted: '[INVALID_OR_OVERSIZED_DETAILS]' };
  }
};

export const toFailure = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  fault: ScriptFault,
): ScriptFailure => {
  const retryable =
    fault.code === 'revo.script.provider.transient' &&
    fault.retryable &&
    definition.manifest.retry.mode === 'transient';

  if (fault.details === undefined) {
    return { code: fault.code, message: fault.message, retryable };
  }

  return {
    code: fault.code,
    message: fault.message,
    retryable,
    details: redactFailureDetails(definition, fault.details),
  };
};
