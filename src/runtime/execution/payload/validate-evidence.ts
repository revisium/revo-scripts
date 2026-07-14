import { ScriptFault } from '../../spec/errors/index.js';
import { codePointLength } from '../../validation/code-point-length.js';

const evidenceLimit = 64;
const evidenceRefLimit = 2_048;
const evidenceSummaryLimit = 4_096;

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
