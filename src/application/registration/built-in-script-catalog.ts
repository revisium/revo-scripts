import { approvalSubjectScript } from '../../scripts/approval/subject/script.js';
import { gitCommitScript } from '../../scripts/git/commit/script.js';
import { gitPushScript } from '../../scripts/git/push/script.js';
import { gitStatusScript } from '../../scripts/git/status/script.js';
import {
  githubPullRequestMarkReadyScript,
  githubPullRequestMergeScript,
  githubPullRequestReadinessScript,
  githubPullRequestUpsertScript,
  githubReviewThreadResolveScript,
  githubReviewThreadRespondScript,
} from '../../scripts/github/index.js';
import { systemEchoScript } from '../../scripts/system/index.js';
import type { BuiltInScriptDescriptor } from './built-in-script-descriptor.js';

const descriptors = [
  approvalSubjectScript,
  gitCommitScript,
  gitPushScript,
  gitStatusScript,
  githubPullRequestUpsertScript,
  githubPullRequestMarkReadyScript,
  githubPullRequestReadinessScript,
  githubReviewThreadRespondScript,
  githubReviewThreadResolveScript,
  githubPullRequestMergeScript,
  systemEchoScript,
]
  .map(
    (definition): BuiltInScriptDescriptor =>
      Object.freeze({
        script: Object.freeze({
          id: definition.manifest.id,
          version: definition.manifest.version,
        }),
        implementation: Object.freeze({ ...definition.implementation }),
      }),
  )
  .sort((left, right) =>
    left.script.id === right.script.id
      ? left.script.version - right.script.version
      : left.script.id.localeCompare(right.script.id),
  );

export const builtInScriptCatalog = (): readonly BuiltInScriptDescriptor[] =>
  Object.freeze([...descriptors]);
