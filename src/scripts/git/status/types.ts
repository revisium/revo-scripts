import type {
  GitStatusClient,
  GitStatusSnapshot,
} from '../../../providers/git/contracts/git-status-client.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';

export type GitStatusInput = Record<string, never>;

export type GitStatusResult = Readonly<GitStatusSnapshot & { readonly clean: boolean }>;

export type GitStatusResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitStatusClient }>>;
}>;
