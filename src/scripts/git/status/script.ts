import { defineScript } from '../../../runtime/definition/define-script.js';
import { GitStatusHandler } from './git-status.handler.js';
import { gitStatusManifest } from './manifest.js';
import { gitStatusInputSchema, gitStatusResultSchema } from './schemas.js';
import type { GitStatusInput, GitStatusResources, GitStatusResult } from './types.js';

export type { GitStatusInput, GitStatusResources, GitStatusResult } from './types.js';

export const gitStatusScript = defineScript<GitStatusInput, GitStatusResult, GitStatusResources>({
  manifest: gitStatusManifest,
  inputSchema: gitStatusInputSchema,
  resultSchema: gitStatusResultSchema,
  implementation: { id: '@revisium/revo-scripts/git/status', version: '1.0.0' },
  handler: new GitStatusHandler(),
});
