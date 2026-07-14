import type { ScriptLifecycleEvent } from '../../spec/events/index.js';
import type { ScriptExecutionIdentity } from './script-execution-identity.js';

export const createLifecycleEvent = (
  definition: ScriptExecutionIdentity,
  executionId: string,
  name: ScriptLifecycleEvent['name'],
  attempt: number,
  timestampMs: number,
  additionalDetails?: Readonly<Record<string, unknown>>,
): ScriptLifecycleEvent => ({
  name,
  details: {
    executionId,
    scriptId: definition.manifest.id,
    scriptVersion: definition.manifest.version,
    definitionDigest: definition.definitionDigest,
    attempt,
    timestampMs,
    ...additionalDetails,
  },
});
