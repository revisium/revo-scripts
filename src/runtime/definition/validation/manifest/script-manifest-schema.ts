import { z } from 'zod';

import type { ScriptManifestV1 } from '../../../spec/manifest/index.js';
import { codePointLength } from '../../../validation/code-point-length.js';
import { isExactSemanticVersion } from '../exact-semantic-version.js';

const scriptIdPattern = /^script:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/;
const namespacedIdentifierPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const resourceNamePattern = /^[a-z][a-z0-9-]*$/;
const providerContractPattern =
  /^revo\.provider\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*\/v[1-9]\d*$/;

const boundedString = (maximum: number, message: string) =>
  z.string().refine((value) => codePointLength(value) <= maximum, { message });

const jsonPointerSchema = boundedString(512, 'Path must contain at most 512 Unicode code points.');

export const scriptManifestSchema: z.ZodType<ScriptManifestV1> = z.strictObject({
  schemaVersion: z.literal('revo.script.manifest/v1'),
  id: z.custom<`script:${string}`>(
    (value) =>
      typeof value === 'string' && codePointLength(value) <= 256 && scriptIdPattern.test(value),
    { message: 'Script id must use the script:<namespace>/<name> format.' },
  ),
  version: boundedString(128, 'Version must contain at most 128 Unicode code points.').refine(
    isExactSemanticVersion,
    { message: 'Version must be an exact semantic version.' },
  ),
  summary: boundedString(512, 'Summary must contain at most 512 Unicode code points.'),
  inputSchemaId: boundedString(
    256,
    'Input schema id must contain at most 256 Unicode code points.',
  ),
  resultSchemaId: boundedString(
    256,
    'Result schema id must contain at most 256 Unicode code points.',
  ),
  effectClass: z.enum(['pure', 'read', 'write', 'publish', 'admin']),
  permissions: z
    .array(
      boundedString(256, 'Permission id must contain at most 256 Unicode code points.').regex(
        namespacedIdentifierPattern,
        'Permission id must be namespaced.',
      ),
    )
    .max(64, 'A manifest may declare at most 64 permissions.'),
  resources: z
    .array(
      z.strictObject({
        name: boundedString(
          128,
          'Resource name must contain at most 128 Unicode code points.',
        ).regex(resourceNamePattern, 'Resource name must be a lowercase identifier.'),
        kind: z.literal('repository'),
        access: z.enum(['read', 'write', 'publish', 'admin']),
      }),
    )
    .max(16, 'A manifest may declare at most 16 resources.'),
  providers: z
    .array(
      z.strictObject({
        name: boundedString(
          128,
          'Provider name must contain at most 128 Unicode code points.',
        ).regex(resourceNamePattern, 'Provider name must be a lowercase identifier.'),
        contract: z.custom<`revo.provider.${string}/v${number}`>(
          (value) =>
            typeof value === 'string' &&
            codePointLength(value) <= 256 &&
            providerContractPattern.test(value),
          { message: 'Provider contract must use the revo.provider.<name>/v<major> format.' },
        ),
        resource: boundedString(
          128,
          'Provider resource must contain at most 128 Unicode code points.',
        ).regex(resourceNamePattern, 'Provider resource must be a lowercase identifier.'),
      }),
    )
    .max(8, 'A manifest may declare at most 8 providers.'),
  credentials: z
    .array(
      z.strictObject({
        name: boundedString(
          128,
          'Credential name must contain at most 128 Unicode code points.',
        ).regex(resourceNamePattern, 'Credential name must be a lowercase identifier.'),
        provider: boundedString(
          256,
          'Credential provider must contain at most 256 Unicode code points.',
        ).regex(resourceNamePattern, 'Credential provider must be a lowercase identifier.'),
        providerRequirement: boundedString(
          128,
          'Credential provider requirement must contain at most 128 Unicode code points.',
        ).regex(
          resourceNamePattern,
          'Credential provider requirement must be a lowercase identifier.',
        ),
      }),
    )
    .max(16, 'A manifest may declare at most 16 credentials.'),
  effects: z
    .array(
      z.enum([
        'filesystem.read',
        'filesystem.write',
        'git.read',
        'git.write',
        'git.remote-write',
        'github.read',
        'github.write',
      ]),
    )
    .max(64, 'A manifest may declare at most 64 effects.'),
  timeout: z.strictObject({
    wallClockMs: z
      .number()
      .refine((value) => Number.isSafeInteger(value) && value >= 1 && value <= 300_000, {
        message: 'Wall-clock timeout must be between 1 and 300000 milliseconds.',
      }),
  }),
  retry: z.strictObject({
    mode: z.enum(['never', 'transient']),
    maxAttempts: z
      .number()
      .refine((value) => Number.isSafeInteger(value) && value >= 1 && value <= 5, {
        message: 'Retry attempts must be a safe integer between 1 and 5.',
      }),
    backoffMs: z.array(
      z.number().refine((value) => Number.isSafeInteger(value) && value >= 0, {
        message: 'Retry backoff must be a non-negative safe integer.',
      }),
    ),
  }),
  idempotency: z.enum(['read-only', 'required', 'not-retryable']),
  classification: jsonPointerSchema.optional(),
  redaction: z.strictObject({
    inputPaths: z.array(jsonPointerSchema).max(128),
    resultPaths: z.array(jsonPointerSchema).max(128),
    errorPaths: z.array(jsonPointerSchema).max(128),
    eventPaths: z.array(jsonPointerSchema).max(128),
  }),
  events: z.strictObject({
    allowed: z
      .array(
        boundedString(256, 'Custom event name must contain at most 256 Unicode code points.')
          .regex(namespacedIdentifierPattern, 'Custom event name must be namespaced.')
          .refine((name) => !name.startsWith('revo.script.'), {
            message: 'Custom event name must not use the reserved revo.script namespace.',
          }),
      )
      .max(64, 'A manifest may declare at most 64 custom events.'),
    detailPaths: z.array(jsonPointerSchema).max(128),
  }),
});
