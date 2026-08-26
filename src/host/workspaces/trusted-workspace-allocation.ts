import type { WorkspaceDescriptor } from './workspace-descriptor.js';

export interface TrustedWorkspaceAllocation extends WorkspaceDescriptor {
  readonly absolutePath: string;
}
