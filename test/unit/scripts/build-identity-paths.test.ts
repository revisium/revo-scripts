import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  digestForEmittedClosure,
  normalizeIdentityPath,
  replaceProviderIdentityPin,
  resolveImportedIdentityPath,
  type OutputFile,
} from '../../../scripts/generate-build-digest.js';

const identityCases = [
  {
    name: 'script definition',
    entryPath: 'scripts/example/operation/script.js',
    windowsEntryPath: 'scripts\\example\\operation\\script.js',
    files: [
      {
        relativePath: 'scripts/example/operation/script.js',
        source: "import './handler.js';\nexport const script = 'example';\n",
      },
      {
        relativePath: 'scripts/example/operation/handler.js',
        source: "import '../shared.js';\nexport const handler = 'example';\n",
      },
      {
        relativePath: 'scripts/example/shared.js',
        source: "export const shared = 'before';\n",
        changedSource: "export const shared = 'after';\n",
      },
    ],
  },
  {
    name: 'provider adapter',
    entryPath: 'providers/example/adapters/node/provider.js',
    windowsEntryPath: 'providers\\example\\adapters\\node\\provider.js',
    files: [
      {
        relativePath: 'providers/example/adapters/node/provider.js',
        source: "import './client.js';\nexport const provider = 'example';\n",
      },
      {
        relativePath: 'providers/example/adapters/node/client.js',
        source: "import '../../shared.js';\nexport const client = 'example';\n",
      },
      {
        relativePath: 'providers/example/shared.js',
        source: "export const shared = 'before';\n",
        changedSource: "export const shared = 'after';\n",
      },
    ],
  },
] as const;

test('normalizes Windows separators and resolves equivalent POSIX identity paths', () => {
  expect({
    normalized: normalizeIdentityPath('providers\\github\\adapters\\fetch\\provider.js'),
    posix: resolveImportedIdentityPath(
      'providers/github/adapters/fetch/provider.js',
      '../shared/client.js',
      'posix',
    ),
    windows: resolveImportedIdentityPath(
      'providers\\github\\adapters\\fetch\\provider.js',
      '..\\shared\\client.js',
      'win32',
    ),
  }).toEqual({
    normalized: 'providers/github/adapters/fetch/provider.js',
    posix: 'providers/github/adapters/shared/client.js',
    windows: 'providers/github/adapters/shared/client.js',
  });
});

test.each(identityCases)(
  'keeps the full $name closure digest equivalent across POSIX and Windows resolution',
  async ({ entryPath, windowsEntryPath, files }) => {
    const fixture = await mkdtemp(join(tmpdir(), 'revo-scripts-identity-paths-'));

    try {
      const outputFiles = await Promise.all(
        files.map(async (file, index): Promise<OutputFile> => {
          const path = join(fixture, `${index}.js`);
          await writeFile(path, file.source);
          return { path, relativePath: file.relativePath };
        }),
      );
      const filesByPath = new Map(outputFiles.map((file) => [file.relativePath, file]));
      const reversedFilesByPath = new Map(
        [...outputFiles].reverse().map((file) => [file.relativePath, file]),
      );
      const posixBefore = await digestForEmittedClosure(entryPath, filesByPath, 'posix');
      const windowsBefore = await digestForEmittedClosure(windowsEntryPath, filesByPath, 'win32');
      const reversedBefore = await digestForEmittedClosure(entryPath, reversedFilesByPath, 'posix');
      const deepFile = outputFiles[2];
      const changedSource = files[2]?.changedSource;
      if (deepFile === undefined || changedSource === undefined) {
        throw new Error('Expected a transitive identity fixture file.');
      }
      expect(await readFile(deepFile.path, 'utf8')).toBe(files[2]?.source);
      await writeFile(deepFile.path, changedSource);
      const posixAfter = await digestForEmittedClosure(entryPath, filesByPath, 'posix');
      const windowsAfter = await digestForEmittedClosure(windowsEntryPath, filesByPath, 'win32');

      expect({
        beforeEquivalent: posixBefore === windowsBefore,
        afterEquivalent: posixAfter === windowsAfter,
        insertionOrderStable: posixBefore === reversedBefore,
        transitiveChangeDetected: posixBefore !== posixAfter,
      }).toEqual({
        beforeEquivalent: true,
        afterEquivalent: true,
        insertionOrderStable: true,
        transitiveChangeDetected: true,
      });
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

test('replaces only the exact named provider identity pin', () => {
  const before =
    "const providerDigest =\n  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;\n" +
    "const unrelated = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';\n";

  expect(
    replaceProviderIdentityPin(
      before,
      'providerDigest',
      'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    ),
  ).toBe(
    "const providerDigest =\n  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as const;\n" +
      "const unrelated = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';\n",
  );
});

test.each([
  {
    name: 'missing',
    source:
      "const unrelated = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;\n",
    message: 'Expected exactly one provider identity pin named providerDigest; found 0.',
  },
  {
    name: 'ambiguous',
    source:
      "const providerDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;\n" +
      "const providerDigest = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;\n",
    message: 'Expected exactly one provider identity pin named providerDigest; found 2.',
  },
  {
    name: 'malformed',
    source: "const providerDigest = 'sha256:ABCDEF' as const;\n",
    message: 'Provider identity pin providerDigest must be a lowercase SHA-256 digest.',
  },
] as const)('rejects a $name provider identity pin', ({ source, message }) => {
  expect(() =>
    replaceProviderIdentityPin(
      source,
      'providerDigest',
      'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    ),
  ).toThrow(message);
});
