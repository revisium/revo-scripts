import type {
  GitStatusClient,
  GitStatusSnapshot,
} from '../../../providers/git/contracts/git-status-client.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';

/** The captures are re-observed before this snapshot is returned. */
export interface GitStatusInput {
  readonly resource: string;
  readonly baseCapture: string;
  readonly headCapture: string;
}

export type GitStatusResult = Readonly<
  GitStatusSnapshot & { readonly schemaVersion: 'workspace-change/v1' }
>;

export type GitStatusResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitStatusClient }>>;
}>;
