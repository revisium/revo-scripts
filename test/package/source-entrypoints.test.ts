import { readFile } from 'node:fs/promises';

import { expect, expectTypeOf, test } from 'vitest';

import * as hostEntry from '../../src/host/index.js';
import * as packageEntry from '../../src/index.js';
import * as gitProviderEntry from '../../src/providers/git/index.js';
import * as githubProviderEntry from '../../src/providers/github/index.js';
import * as runtimeEntry from '../../src/runtime/index.js';
import * as specEntry from '../../src/runtime/spec/index.js';
import type { ScriptDefinition } from '../../src/runtime/spec/index.js';
import * as approvalEntry from '../../src/scripts/approval/index.js';
import * as gitEntry from '../../src/scripts/git/index.js';
import type { GitStatusResources, GitStatusResult } from '../../src/scripts/git/index.js';
import * as githubEntry from '../../src/scripts/github/index.js';
import * as testingEntry from '../../src/testing/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const exportNames = (entry: object): readonly string[] => Object.keys(entry).sort();

test('entry points expose only their curated runtime values', () => {
  expect({
    approval: exportNames(approvalEntry),
    root: exportNames(packageEntry),
    spec: exportNames(specEntry),
    runtime: exportNames(runtimeEntry),
    host: exportNames(hostEntry),
    git: exportNames(gitEntry),
    gitProvider: exportNames(gitProviderEntry),
    github: exportNames(githubEntry),
    githubProvider: exportNames(githubProviderEntry),
    testing: exportNames(testingEntry),
  }).toEqual({
    approval: ['approvalSubjectScript'],
    root: [
      'approvalScripts',
      'builtInScripts',
      'createRevoScripts',
      'createScriptRegistry',
      'createScriptSchema',
      'defineScript',
      'executeScript',
      'gitScripts',
      'githubScripts',
    ],
    spec: ['ScriptFault'],
    runtime: ['createScriptRegistry', 'createScriptSchema', 'defineScript', 'executeScript'],
    host: [],
    git: ['gitCommitScript', 'gitPushScript', 'gitStatusScript'],
    gitProvider: ['nodeGitProviders'],
    github: [
      'githubPullRequestMarkReadyScript',
      'githubPullRequestMergeScript',
      'githubPullRequestReadinessScript',
      'githubPullRequestUpsertScript',
      'githubReviewThreadResolveScript',
      'githubReviewThreadRespondScript',
    ],
    githubProvider: ['fetchGitHubProviders'],
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
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
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
        types: './dist/runtime/spec/index.d.ts',
        import: './dist/runtime/spec/index.js',
      },
      './runtime': {
        types: './dist/runtime/index.d.ts',
        import: './dist/runtime/index.js',
      },
      './host': {
        types: './dist/host/index.d.ts',
        import: './dist/host/index.js',
      },
      './git': {
        types: './dist/scripts/git/index.d.ts',
        import: './dist/scripts/git/index.js',
      },
      './approval': {
        types: './dist/scripts/approval/index.d.ts',
        import: './dist/scripts/approval/index.js',
      },
      './github': {
        types: './dist/scripts/github/index.d.ts',
        import: './dist/scripts/github/index.js',
      },
      './providers/git': {
        types: './dist/providers/git/index.d.ts',
        import: './dist/providers/git/index.js',
      },
      './providers/github': {
        types: './dist/providers/github/index.d.ts',
        import: './dist/providers/github/index.js',
      },
      './testing': {
        types: './dist/testing/index.d.ts',
        import: './dist/testing/index.js',
      },
    },
  });
});
