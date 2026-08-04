import { createHash } from 'node:crypto';

import canonicalize from 'canonicalize';

import type {
  OptionalIdempotencyScriptDefinitionInput,
  RequiredIdempotencyScriptDefinitionInput,
  ScriptDefinition,
  ScriptDefinitionInput,
  UnrefinedIdempotencyScriptDefinitionInput,
} from '../spec/definition/index.js';
import { ScriptFault } from '../spec/errors/index.js';
import type { ScriptManifestAuthoringV1, ScriptManifestV1 } from '../spec/manifest/index.js';
import type { ScriptResourceMap } from '../spec/resources/index.js';
import { validateScriptManifest } from './validation/manifest/validate-manifest.js';
import { validateDefinition } from './validation/validate-definition.js';

const canonicalManifest = (manifest: ScriptManifestAuthoringV1): ScriptManifestV1 => ({
  ...manifest,
  redaction:
    manifest.redaction === undefined
      ? {
          inputPaths: [],
          resultPaths: [],
          errorPaths: [],
          eventPaths: [],
        }
      : manifest.redaction,
  events: manifest.events === undefined ? { allowed: [], detailPaths: [] } : manifest.events,
});

const snapshotManifest = (manifest: ScriptManifestAuthoringV1): ScriptManifestV1 => {
  const validated = validateScriptManifest(canonicalManifest(manifest));
  return {
    ...validated,
    permissions: [...validated.permissions],
    resources: validated.resources.map((resource) => ({ ...resource })),
    providers: validated.providers.map((provider) => ({ ...provider })),
    credentials: validated.credentials.map((credential) => ({ ...credential })),
    effects: [...validated.effects],
    ...(validated.classification === undefined ? {} : { classification: validated.classification }),
    timeout: { ...validated.timeout },
    retry: {
      ...validated.retry,
      backoffMs: [...validated.retry.backoffMs],
    },
    redaction: {
      inputPaths: [...validated.redaction.inputPaths],
      resultPaths: [...validated.redaction.resultPaths],
      errorPaths: [...validated.redaction.errorPaths],
      eventPaths: [...validated.redaction.eventPaths],
    },
    events: {
      allowed: [...validated.events.allowed],
      detailPaths: [...validated.events.detailPaths],
    },
  };
};

const digestDefinition = <I, O, R extends ScriptResourceMap>(
  input: Pick<
    ScriptDefinition<I, O, R>,
    'manifest' | 'inputSchema' | 'resultSchema' | 'implementation'
  >,
  schemas: Readonly<{
    input: Readonly<Record<string, unknown>>;
    result: Readonly<Record<string, unknown>>;
  }>,
): `sha256:${string}` => {
  const canonicalJson = canonicalize({
    manifest: input.manifest,
    inputSchema: schemas.input,
    resultSchema: schemas.result,
    implementation: input.implementation,
  });

  if (canonicalJson === undefined) {
    throw new TypeError('Script definition identity must be JSON-serializable');
  }

  return `sha256:${createHash('sha256').update(canonicalJson).digest('hex')}`;
};

const executionHandler = <I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R>['handler'] => {
  if (input.manifest.idempotency !== 'required') {
    return input.handler;
  }

  const handler = input.handler;
  return {
    execute: async (handlerInput, context) => {
      if (context.idempotencyKey === undefined) {
        throw new ScriptFault(
          'revo.script.idempotency.key_required',
          'This script requires an idempotency key.',
        );
      }

      return handler.execute(handlerInput, {
        ...context,
        idempotencyKey: context.idempotencyKey,
      });
    },
  };
};

export function defineScript<I, O, R extends ScriptResourceMap>(
  input: RequiredIdempotencyScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R>;
export function defineScript<I, O, R extends ScriptResourceMap>(
  input: OptionalIdempotencyScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R>;
export function defineScript<I, O, R extends ScriptResourceMap>(
  input: UnrefinedIdempotencyScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R>;
export function defineScript<I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R> {
  const manifest = snapshotManifest(input.manifest);
  const implementation = { ...input.implementation };
  const schemas = validateDefinition(input);
  const definitionIdentity = {
    manifest,
    inputSchema: input.inputSchema,
    resultSchema: input.resultSchema,
    implementation,
  };

  return {
    ...definitionIdentity,
    definitionDigest: digestDefinition(definitionIdentity, schemas),
    handler: executionHandler(input),
  };
}
