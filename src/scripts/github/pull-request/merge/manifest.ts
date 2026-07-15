import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubPullRequestMergeInputSchema,
  githubPullRequestMergeResultSchema,
} from './schemas.js';

export const githubPullRequestMergeManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request/merge',
  version: '1.0.0',
  summary: 'Merges one pull request only when its head matches the pinned revision.',
  inputSchemaId: githubPullRequestMergeInputSchema.id,
  resultSchemaId: githubPullRequestMergeResultSchema.id,
  effectClass: 'publish',
  permissions: ['github.pull-request.merge'],
  resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read', 'github.write'],
  timeout: { wallClockMs: 60_000 },
  retry: { mode: 'transient', maxAttempts: 3, backoffMs: [250, 1_000] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
