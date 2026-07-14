import type { ScriptManifestV1 } from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

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

const validateReferences = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => [
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
];

export const validateCollectionPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => [
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
  ...findDuplicateIssues(
    manifest.events.allowed,
    '/events/allowed',
    'Custom event names must be unique.',
  ),
  ...validateReferences(manifest),
];
