import type { TrustedWorkspaceAllocation } from '../../../host/workspaces/trusted-workspace-allocation.js';
import type { WorkspaceResolver } from '../../../host/workspaces/workspace-resolver.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import { throwIfAborted } from '../../execution/execution-abort.js';
import type { ValidatedProvider } from './validated-provider.js';

export const resolveProviderWorkspace = async (
  resolver: WorkspaceResolver,
  validated: ValidatedProvider,
  signal: AbortSignal,
): Promise<TrustedWorkspaceAllocation | undefined> => {
  if (validated.provider.workspace === 'none') {
    return undefined;
  }

  if (validated.binding.workspaceId === undefined) {
    throw new ScriptFault(
      'revo.script.provider.workspace_required',
      'Provider requires a workspace binding.',
    );
  }

  const workspace = await resolver.resolve(validated.binding.workspaceId, signal);
  throwIfAborted(signal);

  if (
    workspace.workspaceId !== validated.binding.workspaceId ||
    workspace.repositoryId !== validated.binding.repositoryId
  ) {
    throw new ScriptFault(
      'revo.script.provider.workspace_mismatch',
      'Resolved workspace does not match the resource binding.',
    );
  }

  return workspace;
};
