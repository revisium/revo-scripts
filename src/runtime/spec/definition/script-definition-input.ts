import type { ScriptManifestAuthoringV1 } from '../manifest/script-manifest.js';
import type { ScriptResourceMap } from '../resources/script-resource-map.js';
import type { ScriptSchema } from '../schema/script-schema.js';
import type { RequiredIdempotencyScriptHandler, ScriptHandler } from './script-handler.js';
import type { ScriptImplementationIdentity } from './script-implementation-identity.js';

interface ScriptDefinitionInputBase<I, O, M extends ScriptManifestAuthoringV1> {
  readonly manifest: M;
  readonly inputSchema: ScriptSchema<I>;
  readonly resultSchema: ScriptSchema<O>;
  readonly implementation: ScriptImplementationIdentity;
}

type ScriptHandlerForManifest<
  I,
  O,
  R extends ScriptResourceMap,
  M extends ScriptManifestAuthoringV1,
> = NoInfer<M>['idempotency'] extends 'required'
  ? RequiredIdempotencyScriptHandler<I, O, R>
  : ScriptHandler<I, O, R>;

export type ScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
  M extends ScriptManifestAuthoringV1 = ScriptManifestAuthoringV1,
> = ScriptDefinitionInputBase<I, O, M> &
  Readonly<{
    handler: ScriptHandlerForManifest<I, O, R, M>;
  }>;

export type RequiredIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
> = ScriptDefinitionInput<
  I,
  O,
  R,
  ScriptManifestAuthoringV1 & { readonly idempotency: 'required' }
>;

export type OptionalIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
> = ScriptDefinitionInput<
  I,
  O,
  R,
  ScriptManifestAuthoringV1 & {
    readonly idempotency: 'read-only' | 'not-retryable';
  }
>;

export type UnrefinedIdempotencyScriptDefinitionInput<
  I,
  O,
  R extends ScriptResourceMap,
  M extends ScriptManifestAuthoringV1 = ScriptManifestAuthoringV1,
> = ScriptManifestAuthoringV1['idempotency'] extends M['idempotency']
  ? ScriptDefinitionInput<I, O, R, M>
  : never;
