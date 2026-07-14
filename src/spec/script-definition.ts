import type { ScriptManifestV1 } from './script-manifest.js';
import type { ScriptResourceMap } from './script-resources.js';
import type { ScriptHandlerResult } from './script-result.js';
import type { ScriptSchema } from './script-schema.js';

export interface ScriptCustomEvent {
  readonly name: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ScriptContext<R extends ScriptResourceMap> {
  readonly executionId: string;
  readonly attempt: number;
  readonly idempotencyKey?: string;
  readonly resources: R;
  readonly signal: AbortSignal;
  readonly emit: (event: ScriptCustomEvent) => Promise<void>;
}

export type ScriptHandler<I, O, R extends ScriptResourceMap> = (
  input: Readonly<I>,
  context: Readonly<ScriptContext<R>>,
) => Promise<ScriptHandlerResult<O>>;

export interface ScriptImplementationIdentity {
  readonly id: string;
  readonly version: string;
}

export interface ScriptDefinitionInput<I, O, R extends ScriptResourceMap> {
  readonly manifest: ScriptManifestV1;
  readonly inputSchema: ScriptSchema<I>;
  readonly resultSchema: ScriptSchema<O>;
  readonly handler: ScriptHandler<I, O, R>;
  readonly implementation: ScriptImplementationIdentity;
}

export interface ScriptDefinition<I, O, R extends ScriptResourceMap> extends ScriptDefinitionInput<
  I,
  O,
  R
> {
  readonly definitionDigest: `sha256:${string}`;
}
