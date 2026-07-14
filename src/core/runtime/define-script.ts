import { createHash } from 'node:crypto';

import canonicalize from 'canonicalize';

import type { ScriptDefinition, ScriptDefinitionInput } from '../spec/script-definition.js';
import type { ScriptManifestV1 } from '../spec/script-manifest.js';
import type { ScriptResourceMap } from '../spec/script-resources.js';
import { validateDefinition } from './validate-definition.js';
import { validateScriptManifest } from './validate-manifest.js';

const freezeManifest = (manifest: ScriptManifestV1): ScriptManifestV1 =>
  Object.freeze({
    ...manifest,
    permissions: Object.freeze([...manifest.permissions]),
    resources: Object.freeze(manifest.resources.map((resource) => Object.freeze({ ...resource }))),
    providers: Object.freeze(manifest.providers.map((provider) => Object.freeze({ ...provider }))),
    credentials: Object.freeze(
      manifest.credentials.map((credential) => Object.freeze({ ...credential })),
    ),
    effects: Object.freeze([...manifest.effects]),
    timeout: Object.freeze({ ...manifest.timeout }),
    retry: Object.freeze({
      ...manifest.retry,
      backoffMs: Object.freeze([...manifest.retry.backoffMs]),
    }),
    redaction: Object.freeze({
      inputPaths: Object.freeze([...manifest.redaction.inputPaths]),
      resultPaths: Object.freeze([...manifest.redaction.resultPaths]),
      errorPaths: Object.freeze([...manifest.redaction.errorPaths]),
      eventPaths: Object.freeze([...manifest.redaction.eventPaths]),
    }),
    events: Object.freeze({
      allowed: Object.freeze([...manifest.events.allowed]),
      detailPaths: Object.freeze([...manifest.events.detailPaths]),
    }),
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
  const manifest = freezeManifest(validateScriptManifest(input.manifest));
  const implementation = Object.freeze({ ...input.implementation });
  const validatedInput = { ...input, manifest, implementation };
  const schemas = validateDefinition(validatedInput);

  return Object.freeze({
    manifest,
    inputSchema: input.inputSchema,
    resultSchema: input.resultSchema,
    implementation,
    definitionDigest: digestDefinition(validatedInput, schemas),
    handler: input.handler,
  });
};
