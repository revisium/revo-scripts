import type { CredentialDescriptor } from '../../host/credentials/credential-resolver.js';
import type { ScriptProviderDescriptor } from '../../host/providers/script-provider-descriptor.js';
import type { ScriptResourceDescriptor } from '../../host/resources/resource-resolver.js';
import type { ScriptCustomEvent } from '../../runtime/spec/events/index.js';
import type { JsonValue } from '../../runtime/spec/json/json-value.js';
import type { ScriptManifestV1, ScriptResourceAccess } from '../../runtime/spec/manifest/index.js';
import type { ScriptEvidence, ScriptFailure } from '../../runtime/spec/result/index.js';
import type { ScriptIdentityPin } from './script-identity-pin.js';

export type { JsonObject, JsonValue } from '../../runtime/spec/json/json-value.js';

export interface AttemptContext {
  readonly signal: AbortSignal;
}

export interface ScriptBindingInput {
  readonly script: ScriptIdentityPin;
  readonly resources: Readonly<
    Record<string, Readonly<{ resourceRef: string; workspaceRef?: string }>>
  >;
  readonly credentials: Readonly<Record<string, string>>;
}

export interface PreparedScriptResource {
  readonly resourceRef: string;
  readonly workspaceRef?: string;
  readonly descriptor: ScriptResourceDescriptor;
  readonly requirement: Readonly<{
    readonly kind: 'repository';
    readonly access: ScriptResourceAccess;
  }>;
}

export interface PreparedScriptBinding {
  readonly schemaVersion: 'prepared-script-binding/v1';
  readonly script: ScriptIdentityPin;
  readonly definitionDigest: `sha256:${string}`;
  readonly implementation: Readonly<{
    readonly id: string;
    readonly version: string;
    readonly buildDigest: `sha256:${string}`;
  }>;
  readonly providers: readonly ScriptProviderDescriptor[];
  readonly resources: Readonly<Record<string, PreparedScriptResource>>;
  readonly credentials: Readonly<Record<string, CredentialDescriptor>>;
  readonly attemptPolicy: Readonly<{
    readonly timeoutMs: number;
    readonly terminationGraceMs: 1_000;
    readonly retry: ScriptManifestV1['retry'];
    readonly idempotency: ScriptManifestV1['idempotency'];
  }>;
}

export interface ScriptAttemptInput {
  readonly executionId: string;
  readonly attemptId: string;
  readonly attemptOrdinal: number;
  readonly script: ScriptIdentityPin;
  readonly binding: PreparedScriptBinding;
  readonly input: JsonValue;
}

export interface ScriptEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptEvent;
}

export interface EventSink {
  emit(emission: ScriptLiveEventEmission): Promise<void>;
}

export interface ScriptAttemptExecutionContext extends AttemptContext {
  readonly events: EventSink;
}

export interface ScriptAttemptRef {
  readonly executionId: string;
  readonly attemptId: string;
}

export type ScriptTerminalAttemptResult =
  | Readonly<{
      kind: 'succeeded';
      value: JsonValue;
      evidence: readonly ScriptEvidence[];
      terminalEvent: ScriptSucceededTerminalEventEmission;
    }>
  | Readonly<{
      kind: 'failed';
      error: ScriptFailure;
      evidence: readonly ScriptEvidence[];
      terminalEvent: ScriptFailedTerminalEventEmission;
    }>
  | Readonly<{
      kind: 'cancelled';
      evidence: readonly ScriptEvidence[];
      terminalEvent: ScriptCancelledTerminalEventEmission;
    }>
  | Readonly<{
      kind: 'timedOut';
      error: ScriptFailure;
      evidence: readonly ScriptEvidence[];
      terminalEvent: ScriptTimedOutTerminalEventEmission;
    }>;

export type ScriptAttemptUncertainResult = Readonly<{
  kind: 'uncertain';
  trigger: 'timeout' | 'cancellation';
  stage: 'acquire' | 'handler' | 'validation' | 'cleanup' | 'event_sink';
  evidence: readonly ScriptEvidence[];
}>;

export type ScriptAttemptResult = ScriptTerminalAttemptResult | ScriptAttemptUncertainResult;

export type AttemptCancellationResult =
  | Readonly<{ kind: 'acknowledged' }>
  | Readonly<{ kind: 'alreadyTerminal'; result: ScriptTerminalAttemptResult }>
  | Readonly<{ kind: 'uncertain'; result: ScriptAttemptUncertainResult }>
  | Readonly<{ kind: 'notFound' }>
  | Readonly<{ kind: 'unknown' }>;

export type ScriptReconciliationResult =
  | Readonly<{ kind: 'terminal'; result: ScriptTerminalAttemptResult }>
  | Readonly<{ kind: 'uncertain'; result: ScriptAttemptUncertainResult }>
  | Readonly<{ kind: 'notFound' }>
  | Readonly<{ kind: 'unknown' }>;

export interface ScriptLifecycleDetails {
  readonly script: ScriptIdentityPin;
  readonly definitionDigest: `sha256:${string}`;
  readonly attemptOrdinal: number;
  readonly timestampMs: number;
}

export type ScriptEvent =
  | Readonly<{ name: 'revo.script.started'; details: ScriptLifecycleDetails }>
  | Readonly<{
      name: 'revo.script.succeeded';
      details: ScriptLifecycleDetails & Readonly<{ evidenceCount: number }>;
    }>
  | Readonly<{
      name: 'revo.script.failed';
      details: ScriptLifecycleDetails &
        Readonly<{
          code: ScriptFailure['code'];
          stage: ScriptFailure['stage'];
          retryable: boolean;
        }>;
    }>
  | Readonly<{ name: 'revo.script.cancelled'; details: ScriptLifecycleDetails }>
  | Readonly<{
      name: 'revo.script.timed_out';
      details: ScriptLifecycleDetails & Readonly<{ code: ScriptFailure['code'] }>;
    }>
  | ScriptCustomEvent;

export type ScriptStartedEvent = Extract<ScriptEvent, { name: 'revo.script.started' }>;
export type ScriptSucceededEvent = Extract<ScriptEvent, { name: 'revo.script.succeeded' }>;
export type ScriptFailedEvent = Extract<ScriptEvent, { name: 'revo.script.failed' }>;
export type ScriptCancelledEvent = Extract<ScriptEvent, { name: 'revo.script.cancelled' }>;
export type ScriptTimedOutEvent = Extract<ScriptEvent, { name: 'revo.script.timed_out' }>;

export type ScriptLiveEvent = ScriptStartedEvent | ScriptCustomEvent;

export interface ScriptLiveEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptLiveEvent;
}

export type ScriptTerminalEvent =
  | ScriptSucceededEvent
  | ScriptFailedEvent
  | ScriptCancelledEvent
  | ScriptTimedOutEvent;

export interface ScriptSucceededTerminalEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptSucceededEvent;
}

export interface ScriptFailedTerminalEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptFailedEvent;
}

export interface ScriptCancelledTerminalEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptCancelledEvent;
}

export interface ScriptTimedOutTerminalEventEmission {
  readonly emissionOrdinal: number;
  readonly event: ScriptTimedOutEvent;
}

export type ScriptTerminalEventEmission =
  | ScriptSucceededTerminalEventEmission
  | ScriptFailedTerminalEventEmission
  | ScriptCancelledTerminalEventEmission
  | ScriptTimedOutTerminalEventEmission;
