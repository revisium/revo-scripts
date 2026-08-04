import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import { githubPublishManifestPolicyV1 } from '../../shared/github-publish-manifest-policy-v1.js';
import {
  githubPullRequestMergeInputSchema,
  githubPullRequestMergeResultSchema,
} from './schemas.js';

export const githubPullRequestMergeManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request/merge',
  version: 1,
  summary: 'Merges one pull request only when its head matches the pinned revision.',
  inputSchemaId: githubPullRequestMergeInputSchema.id,
  resultSchemaId: githubPullRequestMergeResultSchema.id,
  ...githubPublishManifestPolicyV1({
    permission: 'github.pull-request.merge',
    wallClockMs: 60_000,
    maxAttempts: 3,
    backoffMs: [250, 1_000],
  }),
} as const satisfies ScriptManifestV1;
