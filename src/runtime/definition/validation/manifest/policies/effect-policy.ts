import type {
  ScriptEffect,
  ScriptEffectClass,
  ScriptManifestV1,
  ScriptResourceAccess,
} from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

const permittedEffects: Readonly<Record<ScriptEffectClass, ReadonlySet<ScriptEffect>>> = {
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

const maximumAccess: Readonly<Record<Exclude<ScriptEffectClass, 'pure'>, number>> = {
  read: accessRank.read,
  write: accessRank.write,
  publish: accessRank.publish,
  admin: accessRank.admin,
};

const validatePurePolicy = (manifest: ScriptManifestV1): readonly ManifestValidationIssue[] => {
  if (manifest.effectClass !== 'pure') {
    return [];
  }

  const declarations: readonly [string, readonly unknown[], string][] = [
    ['/permissions', manifest.permissions, 'Pure scripts must not declare permissions.'],
    ['/resources', manifest.resources, 'Pure scripts must not declare resources.'],
    ['/providers', manifest.providers, 'Pure scripts must not declare providers.'],
    ['/credentials', manifest.credentials, 'Pure scripts must not declare credentials.'],
    ['/effects', manifest.effects, 'Pure scripts must not declare effects.'],
  ];

  return declarations.flatMap(([path, values, message]) =>
    values.length === 0 ? [] : [{ path, message }],
  );
};

export const validateEffectPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  if (manifest.effectClass === 'pure') {
    return validatePurePolicy(manifest);
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
