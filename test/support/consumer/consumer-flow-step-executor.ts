import type { ScriptExecutionBindings } from '../../../src/host/index.js';
import type { RevoScripts, ScriptPlanDescriptor, ScriptSchema } from '../../../src/index.js';

export interface ConsumerFlowStep<T> {
  readonly plan: ScriptPlanDescriptor;
  readonly executionId: string;
  readonly input: unknown;
  readonly bindings: ScriptExecutionBindings;
  readonly resultSchema: ScriptSchema<T>;
  readonly idempotencyKey?: string;
}

export const executeConsumerFlowStep = async <T>(
  scripts: RevoScripts,
  step: ConsumerFlowStep<T>,
): Promise<T> => {
  const result = await scripts.execute({
    executionId: step.executionId,
    script: step.plan.script,
    providers: step.plan.providers,
    input: step.input,
    bindings: step.bindings,
    ...(step.idempotencyKey === undefined ? {} : { idempotencyKey: step.idempotencyKey }),
  });
  if (!result.ok) {
    throw new Error(`${step.plan.script.id} failed: ${result.error.code} ${result.error.message}`);
  }
  const parsed = await step.resultSchema.validate(result.value);
  if (!parsed.ok) {
    throw new Error(`${step.plan.script.id} returned an invalid typed result.`);
  }
  return parsed.value;
};
