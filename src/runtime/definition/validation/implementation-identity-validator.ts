import { codePointLength } from '../../validation/code-point-length.js';
import { isExactSemanticVersion } from './exact-semantic-version.js';
import type { ManifestValidationIssue } from './manifest/manifest-validation-issue.js';

const implementationIdSegmentPattern = /^[a-z][a-z0-9-]*$/;

const isImplementationId = (value: string): boolean => {
  if (value.startsWith('@')) {
    const segments = value.slice(1).split('/');
    return (
      segments.length >= 3 &&
      segments.every((segment) => implementationIdSegmentPattern.test(segment))
    );
  }

  const segments = value.split(/[./]/);
  return (
    segments.length >= 2 &&
    segments.every((segment) => implementationIdSegmentPattern.test(segment))
  );
};

export const validateImplementationIdentity = (
  id: string,
  version: string,
  buildDigest: string | undefined,
): readonly ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = [];

  if (codePointLength(id) > 256 || !isImplementationId(id)) {
    issues.push({
      path: '/implementation/id',
      message: 'Implementation id must be a stable namespaced identifier.',
    });
  }

  if (codePointLength(version) > 128 || !isExactSemanticVersion(version)) {
    issues.push({
      path: '/implementation/version',
      message: 'Implementation version must be an exact semantic version.',
    });
  }

  if (buildDigest === undefined || !/^sha256:[0-9a-f]{64}$/.test(buildDigest)) {
    issues.push({
      path: '/implementation/buildDigest',
      message: 'Implementation build digest must be a lowercase SHA-256 digest.',
    });
  }

  return issues;
};
