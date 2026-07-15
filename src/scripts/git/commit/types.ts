import type { GitChangeV1, GitCommitClient } from '../../../providers/git/index.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';

export interface GitCommitInput {
  readonly resource: string;
  /** Pinned canonical remote identity; never inferred from ambient Git configuration. */
  readonly remoteIdentity: string;
  readonly branch: string;
  readonly expectedParent: string;
  readonly expectedTree: string;
  readonly title: string;
  readonly issueRef?:
    | Readonly<{
        owner: string;
        repository: string;
        number: number;
        url: string;
      }>
    | undefined;
  readonly issueAction: 'close' | 'refs' | 'none';
  readonly author: Readonly<{
    readonly name: string;
    readonly email: string;
    readonly timestamp: string;
  }>;
}

export type GitCommitResult = GitChangeV1;

export type GitCommitResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitCommitClient }>>;
}>;
