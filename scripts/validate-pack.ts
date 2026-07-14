import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

interface PackFile {
  path: string;
}

interface PackManifest {
  files: PackFile[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPackManifest = (value: unknown): value is PackManifest =>
  isRecord(value) &&
  Array.isArray(value.files) &&
  value.files.every((file: unknown) => isRecord(file) && typeof file.path === 'string');

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_cache: '.cache/npm',
    npm_config_loglevel: 'silent',
  },
});

const packResult: unknown = JSON.parse(output);
assert.ok(Array.isArray(packResult) && packResult.length === 1);

const manifest: unknown = packResult[0];
assert.ok(isPackManifest(manifest));

const paths = manifest.files.map((file) => file.path).sort();
const requiredPaths = [
  'LICENSE',
  'README.md',
  'dist/runtime/index.d.ts',
  'dist/runtime/index.js',
  'dist/runtime/spec/index.d.ts',
  'dist/runtime/spec/index.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/providers/git/index.d.ts',
  'dist/providers/git/index.js',
  'dist/scripts/git/index.d.ts',
  'dist/scripts/git/index.js',
  'dist/testing/index.d.ts',
  'dist/testing/index.js',
  'package.json',
];

for (const requiredPath of requiredPaths) {
  assert.ok(paths.includes(requiredPath), `Package is missing ${requiredPath}`);
}

const stalePaths = paths.filter((path) =>
  /^(?:dist\/(?:core|spec|definition|registry|execution|validation|facade))(?:\/|$)/.test(path),
);
assert.deepEqual(stalePaths, [], `Package contains stale build paths: ${stalePaths.join(', ')}`);

const unexpectedPaths = paths.filter(
  (path) =>
    !['LICENSE', 'README.md', 'package.json'].includes(path) &&
    !/^dist\/.*\.(?:d\.ts|d\.ts\.map|js|js\.map)$/.test(path),
);

assert.deepEqual(unexpectedPaths, [], `Unexpected package files: ${unexpectedPaths.join(', ')}`);
console.log(`Package content validation passed (${paths.length} files).`);
