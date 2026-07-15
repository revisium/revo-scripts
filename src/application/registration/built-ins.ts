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
import type { ScriptDefinitionModule } from './script-definition-module.js';
import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

const packageProvenance = {
  packageName: '@revisium/revo-scripts',
  packageVersion: '0.0.0',
};

export const approvalScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/approval',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(approvalSubjectScript);
  },
});

export const gitScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/git',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(gitCommitScript);
    registrar.register(gitPushScript);
    registrar.register(gitStatusScript);
  },
});

export const builtInScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/built-ins',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(approvalSubjectScript);
    registrar.register(gitCommitScript);
    registrar.register(gitPushScript);
    registrar.register(gitStatusScript);
    registrar.register(githubPullRequestUpsertScript);
    registrar.register(githubPullRequestMarkReadyScript);
    registrar.register(githubPullRequestReadinessScript);
    registrar.register(githubReviewThreadRespondScript);
    registrar.register(githubReviewThreadResolveScript);
    registrar.register(githubPullRequestMergeScript);
  },
});

export const githubScripts = (): ScriptDefinitionModule => ({
  id: '@revisium/revo-scripts/scripts/github',
  provenance: packageProvenance,
  registerInto: (registrar: ScriptDefinitionRegistrar) => {
    registrar.register(githubPullRequestUpsertScript);
    registrar.register(githubPullRequestMarkReadyScript);
    registrar.register(githubPullRequestReadinessScript);
    registrar.register(githubReviewThreadRespondScript);
    registrar.register(githubReviewThreadResolveScript);
    registrar.register(githubPullRequestMergeScript);
  },
});
