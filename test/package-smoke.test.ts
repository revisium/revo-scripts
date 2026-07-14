import { readFile } from 'node:fs/promises';

import { expect, expectTypeOf, test } from 'vitest';

import * as runtimeEntry from '../src/core/runtime/index.js';
import * as specEntry from '../src/core/spec/index.js';
import type { ScriptDefinition } from '../src/core/spec/script-definition.js';
import * as packageEntry from '../src/index.js';
import * as gitProviderEntry from '../src/providers/git/index.js';
import * as gitEntry from '../src/scripts/git/index.js';
import type {
  GitStatusResources,
  GitStatusResult,
} from '../src/scripts/git/status/versions/1.0.0/script.js';
import * as testingEntry from '../src/testing/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const exportNames = (entry: object): readonly string[] => Object.keys(entry).sort();

test('entry points expose only their curated runtime values', () => {
  expect({
    root: exportNames(packageEntry),
    spec: exportNames(specEntry),
    runtime: exportNames(runtimeEntry),
    git: exportNames(gitEntry),
    gitProvider: exportNames(gitProviderEntry),
    testing: exportNames(testingEntry),
  }).toEqual({
    root: ['createScriptRegistry', 'createScriptSchema', 'defineScript', 'executeScript'],
    spec: ['ScriptFault'],
    runtime: ['createScriptRegistry', 'createScriptSchema', 'defineScript', 'executeScript'],
    git: ['gitStatusScript'],
    gitProvider: [],
    testing: [
      'DeterministicScriptClock',
      'RecordingEventSink',
      'createGitStatusClientFake',
      'createScriptContractHarness',
    ],
  });
});

test('preserves the built-in Git status type surface through its public entrypoint', () => {
  expectTypeOf(gitEntry.gitStatusScript).toMatchTypeOf<
    ScriptDefinition<Record<string, never>, GitStatusResult, GitStatusResources>
  >();
});

test('package metadata declares the intended package and explicit root export', async () => {
  const rawPackageJson: unknown = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  if (!isRecord(rawPackageJson)) {
    throw new TypeError('Expected package.json to contain an object');
  }

  const exports = isRecord(rawPackageJson.exports) ? rawPackageJson.exports : undefined;

  expect({
    name: rawPackageJson.name,
    type: rawPackageJson.type,
    exports,
  }).toEqual({
    name: '@revisium/revo-scripts',
    type: 'module',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
      './spec': {
        types: './dist/core/spec/index.d.ts',
        import: './dist/core/spec/index.js',
      },
      './runtime': {
        types: './dist/core/runtime/index.d.ts',
        import: './dist/core/runtime/index.js',
      },
      './git': {
        types: './dist/scripts/git/index.d.ts',
        import: './dist/scripts/git/index.js',
      },
      './providers/git': {
        types: './dist/providers/git/index.d.ts',
        import: './dist/providers/git/index.js',
      },
      './testing': {
        types: './dist/testing/index.d.ts',
        import: './dist/testing/index.js',
      },
    },
  });
});
