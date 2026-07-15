import type { ScriptExecutionBindings } from '../../../src/host/index.js';
import type { ScriptEffect } from '../../../src/runtime/spec/index.js';

export interface ConsumerFlowBindingOptions {
  readonly repositoryId: string;
  readonly workspaceId?: string;
  readonly access: 'read' | 'write' | 'publish';
  readonly permission: string;
  readonly effects: readonly ScriptEffect[];
  readonly github?: boolean;
}

export const consumerFlowBindings = (
  options: ConsumerFlowBindingOptions,
): ScriptExecutionBindings => ({
  resources: {
    repository: {
      resourceId: 'consumer-flow-resource',
      kind: 'repository',
      repositoryId: options.repositoryId,
      ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
      access: options.access,
      grant: { permissions: [options.permission], effects: options.effects },
      providerCoordinates: options.github
        ? { github: { owner: 'revisium', repository: 'revo-scripts' } }
        : {},
    },
  },
  credentials: options.github
    ? { token: { alias: 'consumer-flow-github-account', provider: 'github' } }
    : {},
});
