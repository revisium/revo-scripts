import type {
  ScriptOperation,
  ScriptImpactClass,
  ScriptManifestV1,
  ScriptResourceAccess,
} from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

const permittedOperations: Readonly<Record<ScriptImpactClass, ReadonlySet<ScriptOperation>>> = {
  pure: new Set(),
  read: new Set(['filesystem.read', 'git.read', 'github.read']),
  write: new Set([
    'filesystem.read',
    'filesystem.write',
    'git.read',
    'git.write',
    'github.read',
    'github.write',
  ]),
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

const maximumAccess: Readonly<Record<Exclude<ScriptImpactClass, 'pure'>, number>> = {
  read: accessRank.read,
  write: accessRank.write,
  publish: accessRank.publish,
  admin: accessRank.admin,
};

const validatePurePolicy = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => {
  if (manifest.impactClass !== 'pure') {
    return [];
  }

  const declarations: readonly [string, readonly unknown[], string][] = [
    ['/permissions', manifest.permissions, 'Pure scripts must not declare permissions.'],
    ['/resources', manifest.resources, 'Pure scripts must not declare resources.'],
    ['/providers', manifest.providers, 'Pure scripts must not declare providers.'],
    ['/credentials', manifest.credentials, 'Pure scripts must not declare credentials.'],
    ['/operations', manifest.operations, 'Pure scripts must not declare operations.'],
  ];

  return declarations.flatMap(([path, values, message]) =>
    values.length === 0 ? [] : [{ path, message }],
  );
};

export const validateOperationPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  if (manifest.impactClass === 'pure') {
    return validatePurePolicy(manifest);
  }

  const issues: ManifestValidationIssue[] = [];
  const classAccess = maximumAccess[manifest.impactClass];
  const classOperations = permittedOperations[manifest.impactClass];

  manifest.resources.forEach((resource, index) => {
    if (accessRank[resource.access] > classAccess) {
      issues.push({
        path: `/resources/${index}/access`,
        message: `Resource access exceeds the ${manifest.impactClass} impact class.`,
      });
    }
  });
  manifest.operations.forEach((operation, index) => {
    if (!classOperations.has(operation)) {
      issues.push({
        path: `/operations/${index}`,
        message: `Operation is not permitted by the ${manifest.impactClass} impact class.`,
      });
    }
  });

  if (
    manifest.resources.length === 0 &&
    (manifest.permissions.length > 0 || manifest.operations.length > 0)
  ) {
    issues.push({
      path: '/resources',
      message: 'A non-pure script with permissions or operations must declare a resource.',
    });
  }

  return issues;
};
