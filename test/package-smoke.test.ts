import { readFile } from 'node:fs/promises';

import { expect, test } from 'vitest';

import * as packageEntry from '../src/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

test('bootstrap entry point has no accidental public API', () => {
  expect(Object.keys(packageEntry)).toEqual([]);
});

test('package metadata declares the intended package and explicit root export', async () => {
  const rawPackageJson: unknown = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  if (!isRecord(rawPackageJson)) {
    throw new TypeError('Expected package.json to contain an object');
  }

  const rootExport = isRecord(rawPackageJson.exports) ? rawPackageJson.exports['.'] : undefined;

  expect({
    name: rawPackageJson.name,
    type: rawPackageJson.type,
    rootExport,
  }).toEqual({
    name: '@revisium/revo-scripts',
    type: 'module',
    rootExport: {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  });
});
