import type { ScriptClock } from '../runtime/spec/execution/index.js';
import type { CredentialResolver } from './credentials/credential-resolver.js';
import type { ResourceResolver } from './resources/resource-resolver.js';
import type { WorkspaceResolver } from './workspaces/workspace-resolver.js';

export interface RevoScriptsHost {
  readonly resources: ResourceResolver;
  readonly workspaces: WorkspaceResolver;
  readonly credentials: CredentialResolver;
  readonly clock?: ScriptClock;
}
