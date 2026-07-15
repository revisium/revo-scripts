import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubPullRequestReadinessInputSchema,
  githubPullRequestReadinessResultSchema,
} from './schemas.js';

export const githubPullRequestReadinessManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request/readiness',
  version: 1,
  summary: 'Observes one bounded pull-request readiness snapshot.',
  inputSchemaId: githubPullRequestReadinessInputSchema.id,
  resultSchemaId: githubPullRequestReadinessResultSchema.id,
  effectClass: 'read',
  permissions: ['github.pull-request.readiness'],
  resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read'],
  timeout: { wallClockMs: 30_000 },
  retry: { mode: 'transient', maxAttempts: 3, backoffMs: [250, 1_000] },
  idempotency: 'read-only',
  classification: '/classification',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
