import type { EventSink } from '../runtime/spec/events/index.js';
import type { ScriptClock } from '../runtime/spec/execution/index.js';
import type { CredentialResolver } from './credentials/credential-resolver.js';
import type { WorkspaceResolver } from './workspaces/workspace-resolver.js';

export interface RevoScriptsHost {
  readonly workspaces: WorkspaceResolver;
  readonly credentials: CredentialResolver;
  readonly events: EventSink;
  readonly clock?: ScriptClock;
}
