import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import { githubPublishManifestPolicyV1 } from '../../shared/github-publish-manifest-policy-v1.js';
import {
  githubPullRequestMarkReadyInputSchema,
  githubPullRequestMarkReadyResultSchema,
} from './schemas.js';

export const githubPullRequestMarkReadyManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request/mark-ready',
  version: 1,
  summary: 'Marks one exact draft pull request revision ready for review.',
  inputSchemaId: githubPullRequestMarkReadyInputSchema.id,
  resultSchemaId: githubPullRequestMarkReadyResultSchema.id,
  ...githubPublishManifestPolicyV1({
    permission: 'github.pull-request.mark-ready',
    wallClockMs: 20_000,
    maxAttempts: 2,
    backoffMs: [500],
  }),
} as const satisfies ScriptManifestV1;
