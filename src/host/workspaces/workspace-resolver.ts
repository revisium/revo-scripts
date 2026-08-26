import type { HostCallContext } from '../resources/resource-resolver.js';
import type { TrustedWorkspaceAllocation } from './trusted-workspace-allocation.js';
import type { WorkspaceDescriptor } from './workspace-descriptor.js';

export type { WorkspaceDescriptor } from './workspace-descriptor.js';

export interface WorkspaceResolver {
  inspect(workspaceRef: string, context: HostCallContext): Promise<WorkspaceDescriptor | undefined>;
  acquire(workspaceRef: string, context: HostCallContext): Promise<TrustedWorkspaceAllocation>;
}
