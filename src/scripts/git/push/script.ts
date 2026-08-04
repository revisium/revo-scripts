import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { GitPushHandler } from './git-push.handler.js';
import { gitPushManifest } from './manifest.js';
import {
  gitPushInputSchema,
  gitPushResultSchema,
  type GitPushInput,
  type GitPushResources,
  type GitPushResult,
} from './schemas.js';

export const gitPushScript = defineScript<GitPushInput, GitPushResult, GitPushResources>({
  manifest: gitPushManifest,
  inputSchema: gitPushInputSchema,
  resultSchema: gitPushResultSchema,
  implementation: builtInImplementation(gitPushManifest.id, '1.0.0'),
  handler: new GitPushHandler(),
});
