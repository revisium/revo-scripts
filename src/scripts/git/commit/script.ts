import { defineScript } from '../../../runtime/definition/define-script.js';
import { GitCommitHandler } from './git-commit.handler.js';
import { gitCommitManifest } from './manifest.js';
import { gitCommitInputSchema, gitCommitResultSchema } from './schemas.js';
import type { GitCommitInput, GitCommitResources, GitCommitResult } from './types.js';

export const gitCommitScript = defineScript<GitCommitInput, GitCommitResult, GitCommitResources>({
  manifest: gitCommitManifest,
  inputSchema: gitCommitInputSchema,
  resultSchema: gitCommitResultSchema,
  implementation: { id: '@revisium/revo-scripts/git/commit', version: '1.0.0' },
  handler: new GitCommitHandler(),
});
