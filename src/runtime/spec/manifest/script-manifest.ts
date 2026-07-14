import type { ScriptCredentialRequirement } from './script-credential-requirement.js';
import type { ScriptEffectClass } from './script-effect-class.js';
import type { ScriptEffect } from './script-effect.js';
import type { ScriptProviderRequirement } from './script-provider-requirement.js';
import type { ScriptResourceRequirement } from './script-resource-requirement.js';

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
  readonly providers: readonly ScriptProviderRequirement[];
  readonly credentials: readonly ScriptCredentialRequirement[];
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
