import type { GitChangeV1, GitPushClient } from '../../../providers/git/index.js';
import type { ScriptResourceHandle } from '../../../runtime/spec/resources/index.js';

export interface GitPushInput {
  readonly change: GitChangeV1;
}

export type GitPushResult = GitChangeV1;

export type GitPushResources = Readonly<{
  repository: ScriptResourceHandle<Readonly<{ git: GitPushClient }>>;
}>;
