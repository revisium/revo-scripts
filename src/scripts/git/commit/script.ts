import { defineScript } from '../../../runtime/definition/define-script.js';
import { builtInImplementation } from '../../../runtime/generated/built-in-implementation.js';
import { GitCommitHandler } from './git-commit.handler.js';
import { gitCommitManifest } from './manifest.js';
import {
  gitCommitInputSchema,
  gitCommitResultSchema,
  type GitCommitInput,
  type GitCommitResources,
  type GitCommitResult,
} from './schemas.js';

export const gitCommitScript = defineScript<GitCommitInput, GitCommitResult, GitCommitResources>({
  manifest: gitCommitManifest,
  inputSchema: gitCommitInputSchema,
  resultSchema: gitCommitResultSchema,
  implementation: builtInImplementation(gitCommitManifest.id, '1.0.0'),
  handler: new GitCommitHandler(),
});
