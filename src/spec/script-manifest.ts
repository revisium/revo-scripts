export type ScriptEffectClass = 'pure' | 'read' | 'write' | 'publish' | 'admin';

export type ScriptResourceAccess = 'read' | 'write' | 'publish' | 'admin';

export type ScriptEffect =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'git.read'
  | 'git.write'
  | 'git.remote-write'
  | 'github.read'
  | 'github.write';

export interface ScriptResourceRequirement {
  readonly name: string;
  readonly kind: 'repository';
  readonly access: ScriptResourceAccess;
}

export interface ScriptManifestV1 {
  readonly schemaVersion: 'revo.script.manifest/v1';
  readonly id: `script:${string}`;
  readonly version: string;
  readonly summary: string;
  readonly inputSchemaId: string;
  readonly resultSchemaId: string;
  readonly effectClass: ScriptEffectClass;
  readonly permissions: readonly string[];
  readonly resources: readonly ScriptResourceRequirement[];
  readonly effects: readonly ScriptEffect[];
  readonly timeout: Readonly<{ wallClockMs: number }>;
  readonly retry: Readonly<{
    mode: 'never' | 'transient';
    maxAttempts: number;
    backoffMs: readonly number[];
  }>;
  readonly idempotency: 'read-only' | 'required' | 'not-retryable';
  readonly redaction: Readonly<{
    inputPaths: readonly string[];
    resultPaths: readonly string[];
    errorPaths: readonly string[];
    eventPaths: readonly string[];
  }>;
  readonly events: Readonly<{
    allowed: readonly string[];
    detailPaths: readonly string[];
  }>;
}
