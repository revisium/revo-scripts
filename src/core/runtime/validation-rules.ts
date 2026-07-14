const numericIdentifierPattern = /^(?:0|[1-9]\d*)$/;
const alphanumericIdentifierPattern = /^[0-9A-Za-z-]+$/;

const hasSingleSeparator = (value: string, separator: string): boolean =>
  value.indexOf(separator) === value.lastIndexOf(separator);

const isPrereleaseIdentifier = (value: string): boolean =>
  alphanumericIdentifierPattern.test(value) &&
  (!/^\d+$/.test(value) || numericIdentifierPattern.test(value));

const areIdentifiersValid = (
  value: string | undefined,
  validator: (identifier: string) => boolean,
): boolean => value === undefined || value.split('.').every(validator);

export const isExactSemanticVersion = (value: string): boolean => {
  if (!hasSingleSeparator(value, '+')) {
    return false;
  }

  const [versionAndPrerelease, build] = value.split('+');

  if (versionAndPrerelease === undefined) {
    return false;
  }

  const prereleaseSeparator = versionAndPrerelease.indexOf('-');
  const core =
    prereleaseSeparator === -1
      ? versionAndPrerelease
      : versionAndPrerelease.slice(0, prereleaseSeparator);
  const prerelease =
    prereleaseSeparator === -1 ? undefined : versionAndPrerelease.slice(prereleaseSeparator + 1);
  const coreIdentifiers = core.split('.');

  return (
    coreIdentifiers.length === 3 &&
    coreIdentifiers.every((identifier) => numericIdentifierPattern.test(identifier)) &&
    areIdentifiersValid(prerelease, isPrereleaseIdentifier) &&
    areIdentifiersValid(build, (identifier) => alphanumericIdentifierPattern.test(identifier))
  );
};

export const codePointLength = (value: string): number => Array.from(value).length;
