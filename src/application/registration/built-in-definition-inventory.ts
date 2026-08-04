import type {
  ScriptDefinition,
  ScriptImplementationIdentity,
} from '../../runtime/spec/definition/index.js';
import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
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
import type { ScriptDefinitionRegistrar } from './script-definition-registrar.js';

export type BuiltInDefinitionFamily = 'approval' | 'system' | 'git' | 'github';

export interface BuiltInDefinitionInventoryEntry {
  readonly family: BuiltInDefinitionFamily;
  readonly manifest: ScriptManifestV1;
  readonly implementation: ScriptImplementationIdentity;
  registerInto(registrar: ScriptDefinitionRegistrar): void;
}

const inventoryEntry = <I, O, R extends ScriptResourceMap>(
  family: BuiltInDefinitionFamily,
  definition: ScriptDefinition<I, O, R>,
): BuiltInDefinitionInventoryEntry => ({
  family,
  manifest: definition.manifest,
  implementation: definition.implementation,
  registerInto: (registrar) => registrar.register(definition),
});

export const builtInDefinitionInventory = [
  inventoryEntry('approval', approvalSubjectScript),
  inventoryEntry('system', systemEchoScript),
  inventoryEntry('git', gitCommitScript),
  inventoryEntry('git', gitPushScript),
  inventoryEntry('git', gitStatusScript),
  inventoryEntry('github', githubPullRequestUpsertScript),
  inventoryEntry('github', githubPullRequestMarkReadyScript),
  inventoryEntry('github', githubPullRequestReadinessScript),
  inventoryEntry('github', githubReviewThreadRespondScript),
  inventoryEntry('github', githubReviewThreadResolveScript),
  inventoryEntry('github', githubPullRequestMergeScript),
] as const satisfies readonly BuiltInDefinitionInventoryEntry[];
