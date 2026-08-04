import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { GitStatusHandler } from './git-status.handler.js';
import { gitStatusManifest } from './manifest.js';
import {
  gitStatusInputSchema,
  gitStatusResultSchema,
  type GitStatusInput,
  type GitStatusResources,
  type GitStatusResult,
} from './schemas.js';

export type { GitStatusInput, GitStatusResources, GitStatusResult } from './schemas.js';

export const gitStatusScript = defineScript<GitStatusInput, GitStatusResult, GitStatusResources>({
  manifest: gitStatusManifest,
  inputSchema: gitStatusInputSchema,
  resultSchema: gitStatusResultSchema,
  implementation: builtInImplementation(gitStatusManifest.id, '1.0.0'),
  handler: new GitStatusHandler(),
});
