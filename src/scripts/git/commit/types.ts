import type { GitChangeV1, GitCommitClient } from '../../../providers/git/index.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';

export interface GitCommitInput {
  readonly repositoryId: string;
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly expectedParent: string;
  readonly expectedTree: string;
  readonly message: string;
  readonly authorship: Readonly<{
    name: string;
    email: string;
    timestamp: string;
  }>;
}

export type GitCommitResult = GitChangeV1;

export type GitCommitResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitCommitClient }>>;
}>;
