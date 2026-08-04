import type { ScriptManifestV1 } from '../../runtime/spec/manifest/index.js';

type PureScriptManifestPolicy = Pick<
  ScriptManifestV1,
  | 'effectClass'
  | 'permissions'
  | 'resources'
  | 'providers'
  | 'credentials'
  | 'effects'
  | 'timeout'
  | 'retry'
  | 'redaction'
  | 'events'
> &
  Readonly<{ idempotency: 'read-only' }>;

export const pureScriptManifestPolicy = (): PureScriptManifestPolicy => ({
  effectClass: 'pure',
  permissions: [],
  resources: [],
  providers: [],
  credentials: [],
  effects: [],
  timeout: { wallClockMs: 1_000 },
  retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
  idempotency: 'read-only',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
});
