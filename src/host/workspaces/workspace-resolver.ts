import type { TrustedWorkspaceAllocation } from './trusted-workspace-allocation.js';

export interface WorkspaceResolver {
  resolve(workspaceId: string, signal: AbortSignal): Promise<TrustedWorkspaceAllocation>;
}
