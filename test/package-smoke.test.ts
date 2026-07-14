import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as packageEntry from '../src/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

void test('bootstrap entry point has no accidental public API', () => {
  assert.deepEqual(Object.keys(packageEntry), []);
});

void test('package metadata declares the intended package and explicit root export', async () => {
  const rawPackageJson: unknown = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.ok(isRecord(rawPackageJson));
  assert.equal(rawPackageJson.name, '@revisium/revo-scripts');
  assert.equal(rawPackageJson.type, 'module');
  assert.ok(isRecord(rawPackageJson.exports));
  assert.ok(isRecord(rawPackageJson.exports['.']));
  assert.equal(rawPackageJson.exports['.'].types, './dist/index.d.ts');
  assert.equal(rawPackageJson.exports['.'].import, './dist/index.js');
});
