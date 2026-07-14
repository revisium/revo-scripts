import { readFile } from 'node:fs/promises';

import { expect, expectTypeOf, test } from 'vitest';

import * as gitEntry from '../src/git/index.js';
import type { GitStatusResources, GitStatusResult } from '../src/git/status.js';
import * as packageEntry from '../src/index.js';
import * as runtimeEntry from '../src/runtime/index.js';
import * as specEntry from '../src/spec/index.js';
import type { ScriptDefinition } from '../src/spec/script-definition.js';
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
    testing: exportNames(testingEntry),
  }).toEqual({
    root: ['createScriptRegistry', 'createScriptSchema', 'defineScript', 'executeScript'],
    spec: ['ScriptFault'],
    runtime: ['createScriptRegistry', 'createScriptSchema', 'defineScript', 'executeScript'],
    git: ['gitStatusScript'],
    testing: [
      'DeterministicScriptClock',
      'RecordingEventSink',
      'createGitStatusCapabilityFake',
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
        types: './dist/spec/index.d.ts',
        import: './dist/spec/index.js',
      },
      './runtime': {
        types: './dist/runtime/index.d.ts',
        import: './dist/runtime/index.js',
      },
      './git': {
        types: './dist/git/index.d.ts',
        import: './dist/git/index.js',
      },
      './testing': {
        types: './dist/testing/index.d.ts',
        import: './dist/testing/index.js',
      },
    },
  });
});
