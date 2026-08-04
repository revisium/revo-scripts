import type { ScriptManifestAuthoringV1 } from '../manifest/script-manifest.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptSchema } from '../schema/script-schema.js';
import type { RequiredIdempotencyScriptHandler, ScriptHandler } from './script-handler.js';
import type { ScriptImplementationIdentity } from './script-implementation-identity.js';

interface ScriptDefinitionInputBase<I, O> {
  readonly inputSchema: ScriptSchema<I>;
  readonly resultSchema: ScriptSchema<O>;
  readonly implementation: ScriptImplementationIdentity;
}

export type RequiredIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
> = ScriptDefinitionInputBase<I, O> &
  Readonly<{
    manifest: ScriptManifestAuthoringV1 & { readonly idempotency: 'required' };
    handler: RequiredIdempotencyScriptHandler<I, O, R>;
  }>;

export type OptionalIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
> = ScriptDefinitionInputBase<I, O> &
  Readonly<{
    manifest: ScriptManifestAuthoringV1 & {
      readonly idempotency: 'read-only' | 'not-retryable';
    };
    handler: ScriptHandler<I, O, R>;
  }>;

export type UnrefinedIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
> = ScriptDefinitionInputBase<I, O> &
  Readonly<{
    manifest: ScriptManifestAuthoringV1;
    handler: ScriptHandler<I, O, R>;
  }>;

export type ScriptDefinitionInput<I, O, R extends ScriptResourceMap> =
  | RequiredIdempotencyScriptDefinitionInput<I, O, R>
  | OptionalIdempotencyScriptDefinitionInput<I, O, R>
  | UnrefinedIdempotencyScriptDefinitionInput<I, O, R>;
