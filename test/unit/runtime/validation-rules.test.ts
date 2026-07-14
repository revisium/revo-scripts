import { expect, test } from 'vitest';

import { isExactSemanticVersion } from '../../../src/core/runtime/validation-rules.js';

test('accepts exact semantic versions including bounded prerelease and build identifiers', () => {
  const versions = ['0.0.0', '1.2.3', '1.2.3-alpha.1+build.5', '1.0.0-alpha-beta'];

  expect(versions.map((version) => [version, isExactSemanticVersion(version)])).toEqual([
    ['0.0.0', true],
    ['1.2.3', true],
    ['1.2.3-alpha.1+build.5', true],
    ['1.0.0-alpha-beta', true],
  ]);
});

test('rejects ranges, incomplete versions, leading zeroes, and malformed metadata', () => {
  const versions = ['^1.0.0', '1.0', '01.0.0', '1.0.0-01', '1.0.0+', '1.0.0+build+again'];

  expect(versions.map((version) => [version, isExactSemanticVersion(version)])).toEqual([
    ['^1.0.0', false],
    ['1.0', false],
    ['01.0.0', false],
    ['1.0.0-01', false],
    ['1.0.0+', false],
    ['1.0.0+build+again', false],
  ]);
});
