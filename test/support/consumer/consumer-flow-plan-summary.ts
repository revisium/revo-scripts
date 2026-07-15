import type { ScriptPlanDescriptor } from '../../../src/index.js';

export const summarizeConsumerPlan = (plan: ScriptPlanDescriptor) => ({
  script: `${plan.script.id}@${plan.script.version}`,
  permissions: plan.manifest.permissions,
  resources: plan.manifest.resources.map((resource) => `${resource.name}:${resource.access}`),
  effects: plan.manifest.effects,
  providers: plan.providers.map((provider) => ({
    name: provider.name,
    resource: provider.resource,
    id: provider.id,
    contract: provider.contract,
    implementationDigest: provider.implementationDigest,
    workspace: provider.workspace,
  })),
});
