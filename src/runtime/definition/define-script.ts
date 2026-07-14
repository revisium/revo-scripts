import { createHash } from 'node:crypto';

import canonicalize from 'canonicalize';

import type { ScriptDefinition, ScriptDefinitionInput } from '../spec/definition/index.js';
import type { ScriptManifestV1 } from '../spec/manifest/index.js';
import type { ScriptResourceMap } from '../spec/resources/index.js';
import { validateScriptManifest } from './validation/manifest/validate-manifest.js';
import { validateDefinition } from './validation/validate-definition.js';

const snapshotManifest = (manifest: ScriptManifestV1): ScriptManifestV1 => ({
  ...manifest,
  permissions: [...manifest.permissions],
  resources: manifest.resources.map((resource) => ({ ...resource })),
  providers: manifest.providers.map((provider) => ({ ...provider })),
  credentials: manifest.credentials.map((credential) => ({ ...credential })),
  effects: [...manifest.effects],
  timeout: { ...manifest.timeout },
  retry: {
    ...manifest.retry,
    backoffMs: [...manifest.retry.backoffMs],
  },
  redaction: {
    inputPaths: [...manifest.redaction.inputPaths],
    resultPaths: [...manifest.redaction.resultPaths],
    errorPaths: [...manifest.redaction.errorPaths],
    eventPaths: [...manifest.redaction.eventPaths],
  },
  events: {
    allowed: [...manifest.events.allowed],
    detailPaths: [...manifest.events.detailPaths],
  },
});

const digestDefinition = <I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
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

export const defineScript = <I, O, R extends ScriptResourceMap>(
  input: ScriptDefinitionInput<I, O, R>,
): ScriptDefinition<I, O, R> => {
  const manifest = snapshotManifest(validateScriptManifest(input.manifest));
  const implementation = { ...input.implementation };
  const validatedInput = { ...input, manifest, implementation };
  const schemas = validateDefinition(validatedInput);

  return {
    manifest,
    inputSchema: input.inputSchema,
    resultSchema: input.resultSchema,
    implementation,
    definitionDigest: digestDefinition(validatedInput, schemas),
    handler: input.handler,
  };
};
