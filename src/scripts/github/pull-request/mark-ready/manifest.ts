import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
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
  effectClass: 'publish',
  permissions: ['github.pull-request.mark-ready'],
  resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read', 'github.write'],
  timeout: { wallClockMs: 20_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
