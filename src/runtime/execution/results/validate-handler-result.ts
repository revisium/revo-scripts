import type { ScriptDefinition } from '../../spec/definition/index.js';
import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptResourceMap } from '../../spec/resources/index.js';
import type { ScriptHandlerResult } from '../../spec/result/index.js';
import type { ScriptDeadline } from '../deadline/script-deadline.js';
import { assertJsonPayloadWithinLimit } from '../payload/assert-json-payload-limit.js';
import { validateEvidence } from '../payload/validate-evidence.js';
import type { ValidatedHandlerResult } from './validated-handler-result.js';

export const validateHandlerResult = async <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  handlerResult: ScriptHandlerResult<O>,
  deadline: ScriptDeadline,
): Promise<ValidatedHandlerResult<O>> => {
  const result = await deadline.race(definition.resultSchema.validate(handlerResult.value));

  if (!result.ok) {
    throw new ScriptFault('revo.script.validation.result', 'Script result is invalid.', {
      details: { issues: result.issues },
    });
  }

  assertJsonPayloadWithinLimit(result.value, 'result');
  const evidence = [...(handlerResult.evidence ?? [])];
  validateEvidence(evidence);

  return { value: result.value, evidence };
};
