import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import { githubPublishManifestPolicyV1 } from '../../shared/github-publish-manifest-policy-v1.js';
import {
  githubPullRequestUpsertInputSchema,
  githubPullRequestUpsertResultSchema,
} from './schemas.js';

export const githubPullRequestUpsertManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request/upsert',
  version: 1,
  summary: 'Creates or reconciles one pull request at an exact head revision.',
  inputSchemaId: githubPullRequestUpsertInputSchema.id,
  resultSchemaId: githubPullRequestUpsertResultSchema.id,
  ...githubPublishManifestPolicyV1({
    permission: 'github.pull-request.upsert',
    wallClockMs: 30_000,
    maxAttempts: 2,
    backoffMs: [500],
  }),
} as const satisfies ScriptManifestV1;
