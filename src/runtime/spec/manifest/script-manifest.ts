import type { ScriptCredentialRequirement } from './script-credential-requirement.js';
import type { ScriptImpactClass } from './script-impact-class.js';
import type { ScriptOperation } from './script-operation.js';
import type { ScriptProviderRequirement } from './script-provider-requirement.js';
import type { ScriptResourceRequirement } from './script-resource-requirement.js';

export interface ScriptManifestV1 {
  readonly schemaVersion: 'revo.script.manifest/v1';
  readonly id: `script:${string}`;
  readonly version: number;
  readonly summary: string;
  readonly inputSchemaId: string;
  readonly resultSchemaId: string;
  readonly impactClass: ScriptImpactClass;
  readonly permissions: readonly string[];
  readonly resources: readonly ScriptResourceRequirement[];
  readonly providers: readonly ScriptProviderRequirement[];
  readonly credentials: readonly ScriptCredentialRequirement[];
  readonly operations: readonly ScriptOperation[];
  readonly timeout: Readonly<{ wallClockMs: number }>;
  readonly retry: Readonly<{
    mode: 'never' | 'transient';
    maxAttempts: number;
    backoffMs: readonly number[];
  }>;
  readonly idempotency: 'read-only' | 'required' | 'not-retryable';
  /** Optional RFC 6901 pointer to a result classification consumed by the host. */
  readonly classification?: string | undefined;
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

export type ScriptManifestAuthoringV1 = Omit<ScriptManifestV1, 'redaction' | 'events'> &
  Readonly<{
    redaction?: ScriptManifestV1['redaction'];
    events?: ScriptManifestV1['events'];
  }>;
