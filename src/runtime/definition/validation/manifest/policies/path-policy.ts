import type { ScriptManifestV1 } from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

interface LocatedPath {
  readonly value: string;
  readonly path: string;
}

const locatePaths = (values: readonly string[], path: string): readonly LocatedPath[] =>
  values.map((value, index) => ({ value, path: `${path}/${index}` }));

const findDuplicateIssues = (
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

const findInvalidPointerIssues = (
  paths: readonly LocatedPath[],
): readonly ManifestValidationIssue[] =>
  paths
    .filter(({ value }) => !(value === '' || /^(?:\/(?:[^~/]|~0|~1)*)+$/.test(value)))
    .map(({ path }) => ({ path, message: 'Path must be an RFC 6901 JSON Pointer.' }));

export const validatePathPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  const redactionGroups: readonly (readonly LocatedPath[])[] = [
    locatePaths(manifest.redaction.inputPaths, '/redaction/inputPaths'),
    locatePaths(manifest.redaction.resultPaths, '/redaction/resultPaths'),
    locatePaths(manifest.redaction.errorPaths, '/redaction/errorPaths'),
    locatePaths(manifest.redaction.eventPaths, '/redaction/eventPaths'),
  ];
  const redactionPaths = redactionGroups.flat();
  const eventDetailPaths = locatePaths(manifest.events.detailPaths, '/events/detailPaths');

  return [
    ...findInvalidPointerIssues([...redactionPaths, ...eventDetailPaths]),
    ...redactionGroups.flatMap((paths) =>
      findDuplicateIssues(paths, 'Redaction paths must be unique.'),
    ),
    ...findDuplicateIssues(eventDetailPaths, 'Event detail paths must be unique.'),
  ];
};
