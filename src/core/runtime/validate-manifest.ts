import { z } from 'zod';

import { ScriptFault } from '../spec/script-errors.js';
import type {
  ScriptEffect,
  ScriptEffectClass,
  ScriptManifestV1,
  ScriptResourceAccess,
} from '../spec/script-manifest.js';
import { codePointLength, isExactSemanticVersion } from './validation-rules.js';

export interface ManifestValidationIssue {
  readonly path: string;
  readonly message: string;
}

const scriptIdPattern = /^script:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/;
const namespacedIdentifierPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const resourceNamePattern = /^[a-z][a-z0-9-]*$/;
const providerContractPattern =
  /^revo\.provider\.[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*\/v[1-9][0-9]*$/;
const mutationEffects = new Set<ScriptEffect>([
  'filesystem.write',
  'git.write',
  'git.remote-write',
  'github.write',
]);

const permittedEffects: Readonly<Record<ScriptEffectClass, ReadonlySet<ScriptEffect>>> = {
  pure: new Set(),
  read: new Set(['filesystem.read', 'git.read', 'github.read']),
  write: new Set(['filesystem.read', 'filesystem.write', 'git.read', 'git.write', 'github.read']),
  publish: new Set([
    'filesystem.read',
    'filesystem.write',
    'git.read',
    'git.write',
    'git.remote-write',
    'github.read',
    'github.write',
  ]),
  admin: new Set([
    'filesystem.read',
    'filesystem.write',
    'git.read',
    'git.write',
    'git.remote-write',
    'github.read',
    'github.write',
  ]),
};

const accessRank: Readonly<Record<ScriptResourceAccess, number>> = {
  read: 0,
  write: 1,
  publish: 2,
  admin: 3,
};

const maximumAccess: Readonly<Record<Exclude<ScriptEffectClass, 'pure'>, number>> = {
  read: accessRank.read,
  write: accessRank.write,
  publish: accessRank.publish,
  admin: accessRank.admin,
};

const boundedString = (maximum: number, message: string) =>
  z.string().refine((value) => codePointLength(value) <= maximum, { message });

const jsonPointerSchema = boundedString(512, 'Path must contain at most 512 Unicode code points.');

const manifestSchema: z.ZodType<ScriptManifestV1> = z.strictObject({
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

const escapePointerSegment = (segment: PropertyKey): string =>
  String(segment).replaceAll('~', '~0').replaceAll('/', '~1');

const issuePath = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '' : `/${path.map(escapePointerSegment).join('/')}`;

const mapShapeIssues = (error: z.ZodError): readonly ManifestValidationIssue[] =>
  error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: `${issuePath(issue.path)}/${escapePointerSegment(key)}`,
        message: 'Unknown manifest field.',
      }));
    }

    return [{ path: issuePath(issue.path), message: issue.message }];
  });

const findDuplicateIssues = (
  values: readonly string[],
  path: string,
  message: string,
  valuePath = '',
): readonly ManifestValidationIssue[] => {
  const seen = new Set<string>();
  const issues: ManifestValidationIssue[] = [];

  values.forEach((value, index) => {
    if (seen.has(value)) {
      issues.push({ path: `${path}/${index}${valuePath}`, message });
    } else {
      seen.add(value);
    }
  });

  return issues;
};

const validatePurePolicy = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => {
  if (manifest.effectClass !== 'pure') {
    return [];
  }

  const issues: ManifestValidationIssue[] = [];

  if (manifest.permissions.length > 0) {
    issues.push({
      path: '/permissions',
      message: 'Pure scripts must not declare permissions.',
    });
  }

  if (manifest.resources.length > 0) {
    issues.push({
      path: '/resources',
      message: 'Pure scripts must not declare resources.',
    });
  }

  if (manifest.providers.length > 0) {
    issues.push({ path: '/providers', message: 'Pure scripts must not declare providers.' });
  }

  if (manifest.credentials.length > 0) {
    issues.push({ path: '/credentials', message: 'Pure scripts must not declare credentials.' });
  }

  if (manifest.effects.length > 0) {
    issues.push({ path: '/effects', message: 'Pure scripts must not declare effects.' });
  }

  return issues;
};

const validateEffectClass = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => {
  if (manifest.effectClass === 'pure') {
    return [];
  }

  const issues: ManifestValidationIssue[] = [];
  const classAccess = maximumAccess[manifest.effectClass];
  const classEffects = permittedEffects[manifest.effectClass];

  manifest.resources.forEach((resource, index) => {
    if (accessRank[resource.access] > classAccess) {
      issues.push({
        path: `/resources/${index}/access`,
        message: `Resource access exceeds the ${manifest.effectClass} effect class.`,
      });
    }
  });

  manifest.effects.forEach((effect, index) => {
    if (!classEffects.has(effect)) {
      issues.push({
        path: `/effects/${index}`,
        message: `Effect is not permitted by the ${manifest.effectClass} effect class.`,
      });
    }
  });

  if (
    manifest.resources.length === 0 &&
    (manifest.permissions.length > 0 || manifest.effects.length > 0)
  ) {
    issues.push({
      path: '/resources',
      message: 'A non-pure script with permissions or effects must declare a resource.',
    });
  }

  return issues;
};

const validateRetryPolicy = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => {
  if (
    manifest.retry.mode === 'never' &&
    (manifest.retry.maxAttempts !== 1 || manifest.retry.backoffMs.length !== 0)
  ) {
    return [
      {
        path: '/retry',
        message: 'Retry mode never requires one attempt and no backoff.',
      },
    ];
  }

  if (
    manifest.retry.mode === 'transient' &&
    manifest.retry.backoffMs.length !== manifest.retry.maxAttempts - 1
  ) {
    return [
      {
        path: '/retry/backoffMs',
        message: 'Transient retry requires one backoff for every retry attempt.',
      },
    ];
  }

  return [];
};

const validateIdempotencyPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  const declaresMutation = manifest.effects.some((effect) => mutationEffects.has(effect));

  if (manifest.idempotency === 'read-only' && declaresMutation) {
    return [
      {
        path: '/idempotency',
        message: 'Read-only idempotency must not declare a mutation effect.',
      },
    ];
  }

  if (manifest.idempotency === 'required' && !declaresMutation) {
    return [
      {
        path: '/idempotency',
        message: 'Required idempotency must declare a mutation effect.',
      },
    ];
  }

  if (
    manifest.idempotency === 'not-retryable' &&
    (!declaresMutation || manifest.retry.maxAttempts !== 1)
  ) {
    return [
      {
        path: '/idempotency',
        message: 'Not-retryable idempotency requires a mutation effect and one attempt.',
      },
    ];
  }

  return [];
};

interface LocatedPath {
  readonly value: string;
  readonly path: string;
}

const locatePaths = (values: readonly string[], path: string): readonly LocatedPath[] =>
  values.map((value, index) => ({ value, path: `${path}/${index}` }));

const locateRedactionPaths = (manifest: ScriptManifestV1): readonly LocatedPath[] => [
  ...locatePaths(manifest.redaction.inputPaths, '/redaction/inputPaths'),
  ...locatePaths(manifest.redaction.resultPaths, '/redaction/resultPaths'),
  ...locatePaths(manifest.redaction.errorPaths, '/redaction/errorPaths'),
  ...locatePaths(manifest.redaction.eventPaths, '/redaction/eventPaths'),
];

const findRedactionDuplicateIssues = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => [
  ...findLocatedDuplicateIssues(
    locatePaths(manifest.redaction.inputPaths, '/redaction/inputPaths'),
    'Redaction paths must be unique.',
  ),
  ...findLocatedDuplicateIssues(
    locatePaths(manifest.redaction.resultPaths, '/redaction/resultPaths'),
    'Redaction paths must be unique.',
  ),
  ...findLocatedDuplicateIssues(
    locatePaths(manifest.redaction.errorPaths, '/redaction/errorPaths'),
    'Redaction paths must be unique.',
  ),
  ...findLocatedDuplicateIssues(
    locatePaths(manifest.redaction.eventPaths, '/redaction/eventPaths'),
    'Redaction paths must be unique.',
  ),
];

const isJsonPointer = (value: string): boolean =>
  value === '' || /^(?:\/(?:[^~/]|~0|~1)*)+$/.test(value);

const findInvalidPointerIssues = (
  paths: readonly LocatedPath[],
): readonly ManifestValidationIssue[] =>
  paths
    .filter(({ value }) => !isJsonPointer(value))
    .map(({ path }) => ({ path, message: 'Path must be an RFC 6901 JSON Pointer.' }));

const findLocatedDuplicateIssues = (
  paths: readonly LocatedPath[],
  message: string,
): readonly ManifestValidationIssue[] => {
  const seen = new Set<string>();
  const issues: ManifestValidationIssue[] = [];

  paths.forEach(({ value, path }) => {
    if (seen.has(value)) {
      issues.push({ path, message });
    } else {
      seen.add(value);
    }
  });

  return issues;
};

export const validateManifest = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  const redactionPaths = locateRedactionPaths(manifest);
  const eventDetailPaths = locatePaths(manifest.events.detailPaths, '/events/detailPaths');

  return [
    ...findDuplicateIssues(
      manifest.permissions,
      '/permissions',
      'Permission identifiers must be unique.',
    ),
    ...findDuplicateIssues(manifest.effects, '/effects', 'Effects must be unique.'),
    ...findDuplicateIssues(
      manifest.resources.map((resource) => resource.name),
      '/resources',
      'Resource names must be unique.',
      '/name',
    ),
    ...findDuplicateIssues(
      manifest.providers.map((provider) => provider.name),
      '/providers',
      'Provider names must be unique.',
      '/name',
    ),
    ...findDuplicateIssues(
      manifest.credentials.map((credential) => credential.name),
      '/credentials',
      'Credential names must be unique.',
      '/name',
    ),
    ...manifest.providers.flatMap((provider, index) =>
      manifest.resources.some((resource) => resource.name === provider.resource)
        ? []
        : [
            {
              path: `/providers/${index}/resource`,
              message: 'Provider must reference a declared resource.',
            },
          ],
    ),
    ...manifest.credentials.flatMap((credential, index) =>
      manifest.providers.some((provider) => provider.name === credential.providerRequirement)
        ? []
        : [
            {
              path: `/credentials/${index}/providerRequirement`,
              message: 'Credential must reference a declared provider requirement.',
            },
          ],
    ),
    ...findDuplicateIssues(
      manifest.events.allowed,
      '/events/allowed',
      'Custom event names must be unique.',
    ),
    ...findInvalidPointerIssues([...redactionPaths, ...eventDetailPaths]),
    ...findRedactionDuplicateIssues(manifest),
    ...findLocatedDuplicateIssues(eventDetailPaths, 'Event detail paths must be unique.'),
    ...validatePurePolicy(manifest),
    ...validateEffectClass(manifest),
    ...validateRetryPolicy(manifest),
    ...validateIdempotencyPolicy(manifest),
  ];
};

const throwManifestFault = (issues: readonly ManifestValidationIssue[]): never => {
  throw new ScriptFault('revo.script.validation.manifest', 'Script manifest is invalid.', {
    details: { issues },
  });
};

export const validateScriptManifest = (value: unknown): ScriptManifestV1 => {
  const shapeResult = manifestSchema.safeParse(value);

  if (!shapeResult.success) {
    throwManifestFault(mapShapeIssues(shapeResult.error));
  }

  const manifest = shapeResult.data;

  if (manifest === undefined) {
    return throwManifestFault([{ path: '', message: 'Manifest must be defined.' }]);
  }

  const policyIssues = validateManifest(manifest);

  if (policyIssues.length > 0) {
    throwManifestFault(policyIssues);
  }

  return manifest;
};
