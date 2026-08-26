import type { JsonValue } from '../../runtime/spec/json/json-value.js';
import type { ScriptOperation } from '../../runtime/spec/manifest/index.js';
export type { JsonObject, JsonValue } from '../../runtime/spec/json/json-value.js';

export interface ScriptResourceDescriptor {
  readonly resourceId: string;
  readonly kind: 'repository';
  readonly repositoryId: string;
  readonly providerCoordinates: Readonly<Record<string, JsonValue>>;
  readonly grant: Readonly<{
    readonly permissions: readonly string[];
    readonly operations: readonly ScriptOperation[];
  }>;
}

export interface HostCallContext {
  readonly signal: AbortSignal;
}

export interface ResourceResolver {
  inspect(
    resourceRef: string,
    context: HostCallContext,
  ): Promise<ScriptResourceDescriptor | undefined>;
}
