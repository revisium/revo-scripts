import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubPullRequestReadinessInputSchema,
  githubPullRequestReadinessResultSchema,
} from './schemas.js';

export const githubPullRequestReadinessManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request-readiness',
  version: '1.0.0',
  summary: 'Reads readiness of one exact pull request head.',
  inputSchemaId: githubPullRequestReadinessInputSchema.id,
  resultSchemaId: githubPullRequestReadinessResultSchema.id,
  effectClass: 'read',
  permissions: ['github.pull-request.readiness'],
  resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read'],
  timeout: { wallClockMs: 20_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
  idempotency: 'read-only',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
