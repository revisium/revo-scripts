import type { ScriptManifestV1 } from '../../../../runtime/spec/manifest/index.js';
import {
  githubPullRequestUpsertInputSchema,
  githubPullRequestUpsertResultSchema,
} from './schemas.js';

export const githubPullRequestUpsertManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:github/pull-request-upsert',
  version: '1.0.0',
  summary: 'Creates or reconciles one pull request at an exact head revision.',
  inputSchemaId: githubPullRequestUpsertInputSchema.id,
  resultSchemaId: githubPullRequestUpsertResultSchema.id,
  effectClass: 'write',
  permissions: ['github.pull-request.upsert'],
  resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
  providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
  credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
  effects: ['github.read', 'github.write'],
  timeout: { wallClockMs: 30_000 },
  retry: { mode: 'transient', maxAttempts: 2, backoffMs: [500] },
  idempotency: 'required',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
} as const satisfies ScriptManifestV1;
